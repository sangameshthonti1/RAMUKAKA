import argparse

from app.core.config import Settings
from app.database.session import build_engine, migrate, session_factory
from app.seed.demo import seed_demo


def main():
    parser = argparse.ArgumentParser(description="Migrate and seed the local Ramukaka demo")
    parser.add_argument(
        "--reset", action="store_true", help="Replace only RK-2048 workflow records"
    )
    args = parser.parse_args()
    engine = build_engine(Settings())
    try:
        migrate(engine)
        with session_factory(engine)() as session:
            seed_demo(session, reset=args.reset)
            session.commit()
        print("RK-2048 demo ready (mock-only; unrelated cases and signups preserved).")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
