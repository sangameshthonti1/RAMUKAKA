from collections.abc import Generator
from pathlib import Path

from alembic.config import Config
from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from alembic import command
from app.core.config import BACKEND_ROOT, Settings
from app.core.errors import WorkflowError
from app.models import Decision, ServiceCase


def build_engine(settings: Settings) -> Engine:
    url = make_url(settings.database_url)
    memory = url.database in {None, "", ":memory:"}
    if not memory:
        path = Path(url.database)
        if not path.is_absolute():
            path = BACKEND_ROOT / path
        path = path.resolve()
        if not path.is_relative_to(BACKEND_ROOT):
            raise ValueError("SQLite files must remain under backend/")
        path.parent.mkdir(parents=True, exist_ok=True)
        url = url.set(database=str(path))
    kwargs = {"poolclass": StaticPool} if memory else {}
    engine = create_engine(
        url,
        connect_args={"check_same_thread": False, "timeout": 10},
        hide_parameters=True,
        **kwargs,
    )

    @event.listens_for(engine, "connect")
    def sqlite_connect(connection, record):
        connection.isolation_level = None
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")

    @event.listens_for(engine, "begin")
    def sqlite_begin(connection):
        # Acquire the writer reservation before checking approvals. This serializes
        # check-and-consume across processes, not just within one Python worker.
        connection.exec_driver_sql("BEGIN IMMEDIATE")

    return engine


def migrate(engine: Engine) -> None:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")


def session_factory(engine: Engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


def get_session(request: Request) -> Generator[Session, None, None]:
    with request.app.state.session_factory() as session:
        try:
            yield session
            session.commit()
        except WorkflowError as exc:
            # Roll back any partial transition before persisting a safe denial audit.
            session.rollback()
            if exc.case_id and session.get(ServiceCase, exc.case_id):
                session.add(
                    Decision(
                        case_id=exc.case_id,
                        action=exc.action,
                        reason=exc.detail,
                        rule=exc.rule,
                        truth_label=exc.truth_label,
                    )
                )
                session.commit()
            raise
        except Exception:
            session.rollback()
            raise
