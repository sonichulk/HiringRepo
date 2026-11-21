# Put the site on Fly.io — step by step

One Fly.io app runs everything: **workroute.co.uk** (hiring site and admin
panel) and **workroute.team** (team portal). Your data (candidates, chats,
team, settings) is kept on a Fly **volume** (a disk) at `/data`. Uploaded
files stay in Cloudflare R2, as before.

You type commands **only once**, today. After step 9, every push to GitHub
updates the site by itself, like Railway.

Cost: about **$5.70/month** for the machine (1 GB memory) + about **$0.15/month**
for the 1 GB disk, plus a few cents of traffic.

> Never paste passwords, keys or tokens into a chat. Type them only in the
> terminal or in the GitHub / Fly.io settings pages.

---

## 0. What you need

- A **Fly.io account**: sign up at fly.io and add a payment card.
- Your **GitHub Codespace** (the same one you used for the rebuild), opened on
  this branch. Its terminal is where you type the commands below.
- The recovered files in the Codespace's `recovered/` folder:
  `candidates.json`, `team.json`, `agreement-seal.json`.
- Your settings (secret values): see step 4.

## 1. Install the Fly.io tool

In the Codespace terminal:

```
curl -L https://fly.io/install.sh | sh
export PATH="$HOME/.fly/bin:$PATH"
fly version
```

## 2. Sign in

```
fly auth login
```

It shows a link: open it, sign in, then come back to the terminal.

## 3. Create the app and its disk

```
fly apps create workroute
fly volumes create workroute_data --region lhr --size 1 --yes
```

`lhr` is London. If the name `workroute` is taken, choose another (for example
`workroute-site`), use it in the first command, and change the line
`app = "workroute"` at the top of `fly.toml` to the same name.

## 4. Add your settings (secrets)

Type them in the terminal like this — one command, as many `NAME=value` as you
like, each in quotes. `--stage` keeps them until the first deploy:

```
fly secrets set --stage ADMIN_PASSWORD="..." ADMIN_SESSION_SECRET="..."
```

To make a new random value for a secret, run:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Name | Needed? | What it is |
|---|---|---|
| `ADMIN_USERNAME` | optional | Admin login name (default `admin`) |
| `ADMIN_PASSWORD` | **yes** | Admin login password — choose a new, strong one |
| `ADMIN_SESSION_SECRET` | **yes** | Random value (new one is fine) |
| `INTERVIEW_TOKEN_SECRET` | **yes** | Signs the links emailed to candidates. **Use the old value if you still have it**: with a new one, every link already emailed (offer, chat, ID check, agreement, address) stops working |
| `R2_ACCOUNT_ID` | **yes** | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | **yes** | R2 key with **read and write** access to your bucket (not the read-only one used for the rebuild) |
| `R2_SECRET_ACCESS_KEY` | **yes** | Its secret |
| `R2_BUCKET` | **yes** | Bucket name |
| `ZEPTOMAIL_TOKEN` | **yes** | Email sending key, from ZeptoMail |
| `ZEPTOMAIL_FROM_ADDRESS` | **yes** | e.g. `careers@workroute.co.uk` |
| `ZEPTOMAIL_FROM_NAME` | optional | Sender name |
| `ZEPTOMAIL_REGION` | if needed | Your ZeptoMail region, as before |
| `TELEGRAM_BOT_TOKEN` | **yes** | From @BotFather (unchanged) |
| `TELEGRAM_CHAT_ID` | **yes** | Your chat id (unchanged) |
| `TEAM_BANK_KEY` | **yes** | Random value (a new one is fine: bank details must be entered again anyway). **Keep a copy** |
| `TEAM_MAIL_DOMAIN` | if used | Domain of the team mailboxes |
| `TEAM_MAIL_INBOUND_SECRET` | if used | Must be the **same value** as set in your email service's inbound settings |
| `COMPANIES_HOUSE_API_KEY` | optional | UK company check |
| `RESEND_API_KEY` | optional | Only if you send with Resend |

Do **not** set `EMAIL_ALLOW_EXAMPLE_DOMAINS`. `DATA_DIR`, `PORT`,
`PUBLIC_BASE_URL` and `TEAM_PORTAL_URL` are already in `fly.toml`.

**Keep a copy of every value in a password manager.** On Railway they were
lost with the account.

## 5. First deploy

Replace `YOUR_ACCOUNT_ID` with your Cloudflare account id:

```
fly deploy --build-arg R2_ACCOUNT_ID=YOUR_ACCOUNT_ID
fly scale count 1 --yes
```

The first build takes a few minutes. `fly scale count 1` keeps exactly one
machine, the one attached to the disk.

## 6. Put your recovered data on the disk

Do this **before** connecting the domains, so nobody uses the site meanwhile.

```
fly ssh sftp shell
```

Then, inside it, one line at a time:

```
put recovered/candidates.json /data/candidates.json
put recovered/team.json /data/team.json
put recovered/agreement-seal.json /data/agreement-seal.json
```

Press **Ctrl + D** to leave, then restart once:

```
fly apps restart workroute
```

(use your app name if you changed it)

## 7. Check it works

Open **https://workroute.fly.dev** (your app name + `.fly.dev`):

- the home page opens;
- `/admin` → sign in with your new admin password → your candidates are there.

## 8. Connect your domains

```
fly certs add workroute.co.uk
fly certs add www.workroute.co.uk
fly certs add workroute.team
fly certs add www.workroute.team
fly ips list
```

At the company that manages your domains' DNS (for example Cloudflare), for
**each of the four names**, replace the old Railway records with:

- an **A** record → the **v4** address from `fly ips list`
- an **AAAA** record → the **v6** address from `fly ips list`

If your DNS is at Cloudflare, set these records to **DNS only** (grey cloud).

Then check each one until it says the certificate is issued (a few minutes):

```
fly certs show workroute.co.uk
```

## 9. Automatic updates from GitHub (like Railway)

```
fly tokens create deploy -x 87600h
```

Copy the token it prints. On GitHub: your repository → **Settings → Secrets and
variables → Actions → New repository secret**, add:

- `FLY_API_TOKEN` = the token
- `R2_ACCOUNT_ID` = your Cloudflare account id

From now on, every push to this branch deploys by itself. You can also start
one by hand: **Actions → Deploy to Fly.io → Run workflow**.

## 10. Finish

- Delete the Codespace (Code → Codespaces → ⋯ → Delete): it holds personal data.
- In the team panel, for each team member: set their professional email,
  schedule and rate, then **Send portal login**.

---

## Useful commands

| What | Command |
|---|---|
| See the live logs | `fly logs` |
| Is it running? | `fly status` |
| Restart | `fly apps restart workroute` |
| Change a setting | `fly secrets set NAME="value"` (restarts by itself) |
| Download the data (your own copy) | `fly ssh sftp get /data/candidates.json` |
| More memory if ever needed | `fly scale memory 2048` |

The `gateway/` folder was only needed on Railway (its plan allowed two domains
per service). Fly.io serves all four domains from one app.
