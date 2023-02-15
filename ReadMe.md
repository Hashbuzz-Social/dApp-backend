# HashBuzz dApp

Description of the environment variable required here for creating all the details.

    ## Environment ##
    NODE_ENV=development

    # Environment variables declared in this file are automatically made available to Prisma.
    # See the documentation for more detail: https://pris.ly/d/prisma-schema#accessing-environment-variables-from-the-schema

    # Prisma supports the native connection string format for PostgreSQL, MySQL, SQLite, SQL Server, MongoDB and CockroachDB.
    # See the documentation for all the connection string options: https://pris.ly/d/connection-strings
    DATABASE_URL="postgresql://username:password@host:port/dbname?schema=schemaname"

    ## Server ##
    PORT=4000
    HOST=localhost


    ## Setup jet-logger ##
    JET_LOGGER_MODE=CONSOLE
    JET_LOGGER_FILEPATH=jet-logger.log
    JET_LOGGER_TIMESTAMP=TRUE
    JET_LOGGER_FORMAT=LINE

    TWITTER_APP_USER_TOKEN=tweeter app APi auth token Auth2

### Cmd for the Solidity build file generation.

       `npx solcjs --bin --abi SmartContract/Hashbuzz.sol -o SmartContract/build`