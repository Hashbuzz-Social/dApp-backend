# Logs Viewer Feature

This document describes the new logs viewing feature that has been implemented for the Hashbuzz dApp backend.

## Overview

The logs feature provides a web-based interface for viewing application logs with GitHub authentication and write permission verification. Only users with write access to the repository can view the logs.

## Features

### Authentication & Authorization

- **GitHub OAuth Integration**: Uses existing GitHub OAuth strategy
- **Write Permission Check**: Verifies that authenticated users have write permissions to the repository
- **Session Management**: Maintains GitHub access tokens in session for permission verification

### Log Filtering Options

- **Time Ranges**:

  - Last 30 minutes
  - Last hour
  - Today
  - Last 7 days
  - Custom date range (with date picker)

- **Log Levels**: Filter by ERROR, WARN, INFO, DEBUG
- **Search**: Text search within log messages
- **Pagination**: Support for large log files with configurable page sizes

### User Interface

- **Modern Web UI**: Clean, responsive design with dark theme for log display
- **Real-time Updates**: Auto-refresh every 30 seconds
- **Statistics**: Shows log count by level (errors, warnings, info)
- **Mobile Responsive**: Works on desktop and mobile devices

## Implementation

### Files Created/Modified

#### Controllers

- `src/controller/Logs.ts` - Handles log retrieval and UI rendering

#### Middleware

- `src/middleware/checkWritePermission.ts` - Verifies GitHub write permissions

#### Routes

- `src/routes/logs-router.ts` - Express router for log endpoints

#### Views

- `src/views/logs.ejs` - Complete web interface for log viewing

#### Server Integration

- Modified `src/server/index.ts` to include logs routes and store GitHub access tokens

### API Endpoints

#### GET /logs

- **Description**: Renders the logs viewing web interface
- **Authentication**: GitHub OAuth required
- **Authorization**: Write permissions required
- **Response**: HTML page with logs viewer

#### GET /logs/api

- **Description**: REST API for retrieving log data
- **Authentication**: GitHub OAuth required
- **Authorization**: Write permissions required
- **Parameters**:
  - `timeRange`: last30min | lastHour | today | last7days | custom
  - `level`: ERROR | WARN | INFO | DEBUG
  - `search`: Search term
  - `startDate`: ISO date for custom range
  - `endDate`: ISO date for custom range
  - `page`: Page number (default: 1)
  - `limit`: Items per page (default: 100, max: 500)

### Security Features

1. **GitHub OAuth**: Only repository collaborators can access
2. **Write Permission Check**: Additional verification for write access
3. **Session Security**: Access tokens stored securely in sessions
4. **Log File Limits**: Maximum 7 days of logs accessible
5. **XSS Protection**: All log content is properly escaped

## Usage

### Accessing the Logs

1. **Navigate to logs page**: `http://your-domain/logs`
2. **GitHub Authentication**: You'll be redirected to GitHub OAuth if not authenticated
3. **Permission Check**: System verifies you have write access to the repository
4. **View Logs**: Use the interface to filter and search logs

### Filtering Logs

1. **Select Time Range**: Choose from preset ranges or custom dates
2. **Filter by Level**: Select specific log levels to view
3. **Search Text**: Enter keywords to find specific log entries
4. **Pagination**: Navigate through multiple pages of results

### Real-time Monitoring

- Logs auto-refresh every 30 seconds for recent time ranges
- Manual refresh button available
- Statistics show current error/warning counts

## Configuration

### Environment Variables

No additional environment variables required. Uses existing GitHub OAuth configuration:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_REPO` - Repository name for permission checks

### Log File Location

- Default: `logs/jet-logger.log`
- Configurable in the controller if needed

## Technical Details

### Log Parsing

- Parses jet-logger format: `[timestamp] LEVEL: message`
- Extracts timestamp, level, and message
- Handles malformed log entries gracefully

### Performance

- File reading is done asynchronously
- Pagination prevents memory issues with large log files
- Client-side filtering reduces server load

### Error Handling

- Graceful handling of missing log files
- Network error recovery
- Invalid date range handling

## Development Notes

### TypeScript Considerations

- Some async middleware warnings exist but don't affect functionality
- Uses express-async-errors for proper error handling
- Type-safe implementations throughout

### Future Enhancements

- Log rotation management
- Export functionality (CSV, JSON)
- Real-time streaming with WebSockets
- Advanced filtering (regex support)
- Log aggregation from multiple sources

## Troubleshooting

### Common Issues

1. **Authentication Failed**: Ensure GitHub OAuth is configured correctly
2. **Permission Denied**: User needs write access to the repository
3. **No Logs Found**: Check log file exists at `logs/jet-logger.log`
4. **Server Errors**: Check application logs for specific error details

### Debug Mode

- Development mode shows additional console logs
- Error details are logged via jet-logger
- Network requests can be monitored in browser dev tools

## Security Considerations

- Never expose logs to unauthenticated users
- Regularly rotate GitHub access tokens
- Monitor access to sensitive log information
- Consider log retention policies for compliance
- Sanitize log content to prevent information leakage

---

_This feature integrates seamlessly with the existing Hashbuzz dApp backend infrastructure and maintains the same security standards as other admin features._
