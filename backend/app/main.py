import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import Engine
from sqlalchemy.exc import IntegrityError, OperationalError

from app.api.chat import router as chat_router
from app.api.coordination import router as coordination_router
from app.api.routes import router
from app.api.schedules import router as schedules_router
from app.api.workspace import router as workspace_router
from app.core.config import Settings
from app.core.errors import WorkflowError
from app.database.session import build_engine, migrate, session_factory
from app.schemas.api import Health
from app.seed.demo import seed_demo
from app.services.schedules import reminder_worker, run_check


def create_app(settings: Settings | None = None, *, engine: Engine | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        database = engine if engine is not None else build_engine(settings)
        application.state.settings = settings
        application.state.engine = database
        application.state.session_factory = session_factory(database)
        stop_reminders = asyncio.Event()
        reminder_task = None
        try:
            if settings.auto_migrate:
                migrate(database)
            if settings.auto_seed:
                with application.state.session_factory() as session:
                    seed_demo(session)
                    session.commit()
            if settings.service_reminders_enabled:
                run_check(application.state.session_factory, settings.service_reminder_batch_size)
                reminder_task = asyncio.create_task(
                    reminder_worker(
                        application.state.session_factory,
                        stop_reminders,
                        interval=settings.service_reminder_interval_seconds,
                        batch_limit=settings.service_reminder_batch_size,
                    ),
                    name="local-service-reminders",
                )
            application.state.service_reminder_task = reminder_task
            yield
        finally:
            stop_reminders.set()
            if reminder_task is not None:
                await reminder_task
            if engine is None:
                database.dispose()

    application = FastAPI(title="Ramukaka local demo API", version="0.1.0", lifespan=lifespan)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH"],
        allow_headers=["Content-Type", "X-Demo-Role", "X-Provider-ID"],
    )
    application.include_router(router)
    application.include_router(workspace_router)
    application.include_router(chat_router)
    application.include_router(coordination_router)
    application.include_router(schedules_router)

    @application.get("/health", response_model=Health)
    def health():
        return Health()

    @application.exception_handler(WorkflowError)
    async def workflow_error(request: Request, exc: WorkflowError):
        return JSONResponse(status_code=exc.status, content={"detail": exc.detail})

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        # Pydantic normally includes raw input. Do not reflect signup PII, tokens,
        # or arbitrary customer text back in diagnostic payloads.
        errors = [{"type": e["type"], "loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors})

    @application.exception_handler(IntegrityError)
    async def integrity_error(request: Request, exc: IntegrityError):
        return JSONResponse(
            status_code=409, content={"detail": "Request conflicts with stored state"}
        )

    @application.exception_handler(OperationalError)
    async def database_error(request: Request, exc: OperationalError):
        return JSONResponse(
            status_code=503, content={"detail": "Local database unavailable; retry later"}
        )

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        return JSONResponse(status_code=500, content={"detail": "Internal backend error"})

    return application


app = create_app()
