# PostgreSQL Backups

Daily backups keep Type Fight player, battle, referral, and analytics data recoverable if the VPS or database breaks.

## Install

Run on the VPS:

```bash
cd /var/www/typefight
chmod +x scripts/backup-postgres.sh
mkdir -p /var/backups/typefight
chmod 700 /var/backups/typefight
```

## Manual Backup

```bash
/var/www/typefight/scripts/backup-postgres.sh
```

The script creates compressed backups in:

```text
/var/backups/typefight
```

By default, backups older than 14 days are deleted.

## Daily Cron

Open root crontab:

```bash
crontab -e
```

Add:

```cron
15 3 * * * /var/www/typefight/scripts/backup-postgres.sh >> /var/log/typefight-backup.log 2>&1
```

This runs every day at 03:15 server time.

## Restore Check

To inspect a backup without restoring it into production:

```bash
pg_restore --list /var/backups/typefight/typefight-YYYYMMDDTHHMMSSZ.dump.gz
```

For a real restore, create a new database first and restore into it:

```bash
createdb typefight_restore
gunzip -c /var/backups/typefight/typefight-YYYYMMDDTHHMMSSZ.dump.gz > /tmp/typefight.restore.dump
pg_restore --dbname=typefight_restore --clean --if-exists /tmp/typefight.restore.dump
```

Do not restore over production until the backup has been checked.
