# HashBuzz dApp

HashBuzz dApp is a monolithic server built with Express.js to handle API requests from the HashBuzz dApp frontend, which is based on React. This server manages all backend-related tasks required for the HashBuzz project.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Server Configuration](#server-configuration)
- [Jet Logger Setup](#jet-logger-setup)
- [Solidity Build](#solidity-build)
- [Getting Started](#getting-started)
- [Contributing](#contributing)
- [License](#license)

## Environment Variables

The following environment variables are required to run the server. These variables should be set in a `.env` file at the root of the project.

### General Environment

- `NODE_ENV`: Set to `development` for development mode.

### Database Configuration

- `DATABASE_URL`: Connection string for the database. Prisma supports PostgreSQL, MySQL, SQLite, SQL Server, MongoDB, and CockroachDB.
  ```plaintext
  DATABASE_URL="postgresql://username:password@host:port/dbname?schema=schemaname"
  ```
- Server Configuration
    
    - `PORT`: Port on which the server will run.
    - `HOST`: Hostname for the server.

    ```plaintext
    PORT=4000
    HOST=localhost
    ```
## Getting started

### Prerequisites

- Node.js (>=14.0.0)
- npm or yarn
- PostgreSQL or another supported database
- Redis Server

### Installation 

1. Clone the repository: 

```plaintext
    git clone https://github.com/hashbuzz/dApp-backend.git
    cd dApp-backend
```

## Contribution

Contributions are welcome! Please read the contributing guidelines for more information.

## Lisence

This project is licensed under the ISC License. See the LICENSE file for more details.
