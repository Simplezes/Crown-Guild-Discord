# Crown Guild
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![Discord.js](https://img.shields.io/badge/Discord.js-14+-blue.svg)
![Turso](https://img.shields.io/badge/Turso-1.0+-red.svg)

![icon](icon.png)

A Discord bot to track Monster Hunter crowns using `discord.js` and Turso (SQLite/libSQL).

## Features

- `/add`: Add a crown (Small, Large, or Gems) for a monster.
- `/remove`: Remove a crown from your collection.
- `/list`: See your own crown collection.
- `/find`: Search for players who have specific crowns.
- `/profile`: View your crown profile.
- `/settings`: Configure your profile.

## Setup

1.  **Clone the repository.**
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure Environment Variables**:
    Create a `.env` file in the root directory and fill in your credentials:
    - `DISCORD_TOKEN`: Your Discord bot token.
    - `DISCORD_CLIENT_ID`: Your Discord application's client ID.
    - `DISCORD_GUILD_ID`: The ID of the server where you want to test the bot.
    - `TURSO_DB_URL`: Your Turso database URL.
    - `TURSO_AUTH_TOKEN`: Your Turso database auth token.

4.  **Register Slash Commands**:
    ```bash
    npm run deploy
    ```

5.  **Start the Bot**:
    ```bash
    npm run start
    ```

## Database Schema

The bot uses a simple relational schema:
- `users`: Stores Discord user IDs.
- `monsters`: Stores monster names.
- `crowns`: A join table linking users and monsters with a crown type.

## Thank You

Icons and data are sourced from [monster-hunter-DB](https://github.com/CrimsonNynja/monster-hunter-DB)