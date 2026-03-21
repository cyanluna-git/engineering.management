"""
Seed UserHistory HIRE records for existing users.

Creates initial HIRE records for all users who don't have any UserHistory entries.
For terminated users (is_active=False), also creates a RESIGN record.

Idempotent: safe to re-run — skips users who already have history.

Usage:
    cd backend
    python -m scripts.seed_user_history
"""

from datetime import datetime
from sqlalchemy.orm import Session

from app.core.database import get_db, get_engine
from app.models.user import User, UserHistory


def seed_user_history(db: Session) -> dict:
    """Create HIRE records for all existing users who don't have any UserHistory."""
    stats = {"created": 0, "skipped": 0, "terminated": 0}

    users = db.query(User).all()

    for user in users:
        # Skip if user already has history
        existing = (
            db.query(UserHistory)
            .filter(UserHistory.user_id == user.id)
            .first()
        )
        if existing:
            stats["skipped"] += 1
            continue

        # Determine start_date: prefer hire_date, fallback to created_at
        start_date = user.hire_date or user.created_at or datetime.utcnow()

        # Create HIRE record
        hire_record = UserHistory(
            user_id=user.id,
            division_id=user.division_id,
            department_id=user.department_id,
            sub_team_id=user.sub_team_id,
            position_id=user.position_id,
            start_date=start_date,
            end_date=None,
            change_type="HIRE",
            remarks="Seeded from existing user data.",
        )
        db.add(hire_record)
        stats["created"] += 1

        # If user is terminated, also create RESIGN record
        if not user.is_active and user.termination_date:
            # Close the HIRE record at termination date
            hire_record.end_date = user.termination_date

            resign_record = UserHistory(
                user_id=user.id,
                division_id=user.division_id,
                department_id=user.department_id,
                sub_team_id=user.sub_team_id,
                position_id=user.position_id,
                start_date=user.termination_date,
                end_date=user.termination_date,
                change_type="RESIGN",
                remarks="Seeded from termination_date.",
            )
            db.add(resign_record)
            stats["terminated"] += 1

    db.commit()
    return stats


if __name__ == "__main__":
    from contextlib import closing

    engine = get_engine()
    print("Seeding UserHistory HIRE records for existing users...")

    with closing(next(get_db())) as db:
        result = seed_user_history(db)
        print(f"Done: {result}")
        print(f"  Created: {result['created']} HIRE records")
        print(f"  Skipped: {result['skipped']} (already had history)")
        print(f"  Terminated: {result['terminated']} (added RESIGN records)")
