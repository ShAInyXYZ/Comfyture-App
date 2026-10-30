# The judges' copy

For whoever puts Comfyture up for the #OpenSourceHiggsfield judges, or puts it up again. The why and the costs are in
[docs/competition/HOSTING.md](../../docs/competition/HOSTING.md) (option B1); this folder is what goes on the server.

| File | Goes to | What it is |
|---|---|---|
| `judge.env.example` | `/etc/comfyture/judge.env`, mode 0600 | The key and the caps the server reads. Fill the key; never commit the filled copy. |
| `comfyture.service` | `/etc/systemd/system/` | Runs `node server/main.ts` as the `comfyture` user from `/opt/comfyture`, restarts it, lets it write only `/var/lib/comfyture`. |
| `Caddyfile` | `/etc/caddy/Caddyfile` | HTTPS, one user and password, uploads up to 200 MB, the progress streams handed on at once. |
| `health.sh` | cron, every 5 minutes | Tells your phone (ntfy) when the copy is down, and at 50, 80 and 100 % of the key's budget spent. |
| `snapshot.sh` | cron, daily | Copies the data folder, checks the copy, keeps the three newest. |

In short, on an Ubuntu 24.04 server with Node.js 22.18+, ffmpeg, Caddy and git:

```bash
sudo useradd --system --home /var/lib/comfyture --create-home comfyture
sudo git clone --depth 1 --branch submission https://github.com/ShAInyXYZ/Comfyture-App /opt/comfyture && cd /opt/comfyture && sudo npm ci
sudo install -d -m 0755 /etc/comfyture && sudo install -m 0600 deploy/judge/judge.env.example /etc/comfyture/judge.env
sudoedit /etc/comfyture/judge.env                      # the judges' key
sudo install -d -o comfyture -g comfyture /var/lib/comfyture/data
sudo cp deploy/judge/comfyture.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now comfyture
curl -s 127.0.0.1:5177/api/info                        # "judge":true
sudo cp deploy/judge/Caddyfile /etc/caddy/Caddyfile && sudoedit /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Then from outside: the password asked, every product on its example, `"judge":true` in `/api/info`, and
`curl -su judge:… https://<your name>/api/account | grep -c comfyui-` printing 0 (the key never leaves the server).
After judging (6 November): stop the server, revoke the key.
