<p align="center">
  <img src="icon.png" width="96" alt="Crown Guild" />
</p>

<h1 align="center">Crown Guild Bot</h1>
<p align="center">Discord bot for tracking Monster Hunter Wilds crowns</p>

<p align="center">
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18+-green?logo=node.js&logoColor=white" />
  <img alt="Discord.js" src="https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white" />
  <img alt="Turso" src="https://img.shields.io/badge/Database-Turso%20LibSQL-orange" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-blue" />
</p>

---

The Discord half of Crown Guild. Handles slash commands for logging crowns, finding hosts, and managing hunts  and pushes real-time events to the web dashboard via Pusher whenever something changes.

**Commands**

| Command | Description |
|---|---|
| `/crown add` | Log a new crown you've earned (Small, Large, or Both) |
| `/crown remove` | Delete a specific crown entry |
| `/crown list` | View your crown collection (or another hunter's) |
| `/crown reset` | Clear your entire crown collection |
| `/hunt flare` | Broadcast a hunt you are hosting (SOS Flare) |
| `/hunt radar` | Scan for active SOS flares and crown hunts |
| `/hunt find` | Search the global registry for specific crown holders |
| `/hunt match` | Find mutual matches — hunters who need what you have |
| `/hunt done` | Mark your active hunt as completed |
| `/wishlist add` | Add a crown you are looking for |
| `/wishlist remove` | Remove a crown from your wishlist |
| `/wishlist view` | View your current wishlist |
| `/profile view` | View your Hunter Card and stats |
| `/profile settings` | Configure Lobby ID, Password, status, and DM preferences |
| `/monster info` | View weaknesses, elements, and lore for a monster |
| `/help` | View the Crown Guild command guide |

---

## Setup

```bash
npm install
cp .env.example .env
# fill in .env
npm run deploy   # register slash commands
npm run start
```

`WEB_HUB_URL` should point to your deployed web app (or `http://localhost:3000` in dev)  it's used for profile links in bot responses and Pusher triggers.

---

## Environment Variables

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Your bot token |
| `DISCORD_CLIENT_ID` | Application client ID  used to register slash commands |
| `DISCORD_GUILD_ID` | Guild ID for guild-scoped command registration (leave empty for global) |
| `TURSO_DB_URL` | libsql:// URL to your Turso database |
| `TURSO_AUTH_TOKEN` | Auth token from Turso |
| `PUSHER_APP_ID` | Pusher app ID |
| `PUSHER_SECRET` | Pusher secret key |
| `NEXT_PUBLIC_PUSHER_KEY` | Pusher publishable key |
| `NEXT_PUBLIC_PUSHER_CLUSTER` | Pusher cluster region, e.g. us2 |
| `WEB_HUB_URL` | URL of the Crown Guild web app |

---

## Deployment

The bot needs to run on a persistent process  Vercel and other serverless platforms won't work. The project includes a `Dockerfile` and `fly.toml` for deploying to [Fly.io](https://fly.io).

```bash
fly deploy
```

Set all environment variables as Fly secrets before deploying.

---

## Related

[Crown Guild Web](https://github.com/Simplezes/Crown-Guild)  the Next.js dashboard that displays crown records, active missions, and hunter profiles.

---

## License

MIT. Icons and monster data sourced from [monster-hunter-DB](https://github.com/CrimsonNynja/monster-hunter-DB).
