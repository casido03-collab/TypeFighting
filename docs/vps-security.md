# VPS Security Checklist

This checklist hardens the Type Fight VPS without risking a lockout. Run it only when you have a working SSH session open.

## 1. Create Deploy User

```bash
adduser deploy
usermod -aG sudo deploy
```

## 2. Add SSH Key For Deploy User

Copy the current authorized key from root:

```bash
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Open a second terminal and test before changing SSH settings:

```bash
ssh deploy@typefight.shop
```

Do not close the root session until deploy login works.

## 3. Allow Deploy To Manage App

```bash
chown -R deploy:deploy /var/www/typefight
```

PM2 currently runs under root. Moving it to `deploy` is safer, but do that as a separate maintenance step after deploy SSH is confirmed.

## 4. Disable Password Login

Edit SSH config:

```bash
nano /etc/ssh/sshd_config
```

Set or add:

```text
PasswordAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
```

Validate and reload:

```bash
sshd -t
systemctl reload ssh
```

Keep the old terminal open and test a new SSH login again.

## 5. Firewall Baseline

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status
```

Expected open ports: SSH, HTTP, HTTPS.

## 6. Token Hygiene

If a Telegram bot token, DB password, or SSH key was pasted into screenshots/chats, rotate it.

Recommended:

```text
BotFather -> /token -> Revoke current token
```

Then update `/var/www/typefight/.env` and restart:

```bash
pm2 restart typefight-api --update-env
```

## 7. GitHub Actions Secrets

Keep only these secrets in GitHub:

```text
VPS_HOST
VPS_USER
VPS_SSH_KEY
```

Prefer `VPS_USER=deploy` after the deploy user is fully tested.

## 8. Updates

Run manually every few weeks:

```bash
apt update && apt upgrade -y
```

Then:

```bash
systemctl status nginx --no-pager
pm2 status
```
