from alembic import context
from app import models  # noqa: F401 -- register model metadata for autogeneration
from app.core.config import Settings
from app.database.base import Base
from app.database.session import build_engine

config = context.config


def apply(connection):
    context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=Settings().database_url,
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    supplied_connection = config.attributes.get("connection")
    if supplied_connection is not None:
        apply(supplied_connection)
    else:
        engine = build_engine(Settings())
        try:
            with engine.begin() as connection:
                apply(connection)
        finally:
            engine.dispose()
