# 📧 Enhanced Mailer Service

The Hashbuzz dApp Backend Mailer Service now supports multiple email recipients with enhanced functionality.

## 🌟 Features

- **Multiple Recipients**: Send emails to multiple recipients using space-separated email addresses
- **Email Validation**: Automatic validation and filtering of email addresses
- **Enhanced Logging**: Detailed logging for email operations and errors
- **HTML Templates**: Rich HTML email templates with styled content
- **Custom Alerts**: Send custom alerts to specific recipients
- **Runtime Management**: Add/remove recipients dynamically

## 🔧 Configuration

### Environment Variables

```bash
# Email service configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
ALERT_RECEIVER="admin@example.com support@example.com alerts@example.com"
```

### Multiple Recipients Format

The `ALERT_RECEIVER` environment variable accepts space-separated email addresses:

```bash
# Single recipient
ALERT_RECEIVER="admin@example.com"

# Multiple recipients
ALERT_RECEIVER="admin@example.com support@example.com alerts@example.com"

# Mixed format (spaces are trimmed automatically)
ALERT_RECEIVER="admin@example.com  support@example.com   alerts@example.com"
```

## 📋 Usage Examples

### Basic Usage

```typescript
import MailerService from './services/mailer/mailerService';

// Initialize the mailer service
const mailer = await MailerService.create();

// Send low balance alert to all configured recipients
await mailer.sendLowBalanceAlert(42.50, "0.0.123456");
```

### Custom Alerts

```typescript
// Send custom alert to all configured recipients
await mailer.sendCustomAlert(
    "System Maintenance", 
    "The system will be down for maintenance from 2:00 AM to 4:00 AM UTC."
);

// Send custom alert to specific recipients
await mailer.sendCustomAlert(
    "Critical Error", 
    "Database connection failed. Immediate attention required.",
    ["devops@example.com", "admin@example.com"]
);
```

### Runtime Management

```typescript
// Get current alert receivers
const currentReceivers = mailer.getAlertReceivers();
console.log('Current recipients:', currentReceivers);

// Add additional recipients at runtime
mailer.addAlertReceivers([
    "newadmin@example.com",
    "monitoring@example.com"
]);
```

## 🎨 Email Templates

### Low Balance Alert

The service automatically sends rich HTML emails for low balance alerts with:
- Warning styling and icons
- Formatted account information
- Action-required messaging
- Professional layout

### Custom Alerts

Custom alerts include:
- Branded header with Hashbuzz styling
- Configurable subject and content
- Clean, responsive design
- Automatic conversion of text to HTML

## 🛡️ Error Handling

The service includes comprehensive error handling:

```typescript
try {
    await mailer.sendLowBalanceAlert(10.0, "0.0.123456");
} catch (error) {
    console.error('Failed to send alert:', error);
    // Handle error appropriately
}
```

## 📊 Logging

The service provides detailed logging:

- **Info**: Successful email operations and recipient counts
- **Warning**: Invalid email addresses and missing configuration
- **Error**: Email sending failures and service errors

Example log output:
```
[INFO] Configured 3 alert receiver(s): admin@example.com, support@example.com, alerts@example.com
[INFO] Low balance alert email sent successfully to 3 recipient(s): admin@example.com, support@example.com, alerts@example.com
[WARN] No valid alert receiver emails found in ALERT_RECEIVER environment variable
[ERROR] Error sending low balance alert email: Connection timeout
```

## 🔍 Email Validation

The service automatically validates email addresses using a robust regex pattern:
- Filters out invalid email formats
- Removes empty strings and whitespace
- Logs validation results

## 🚀 Migration from Single Recipient

If you're upgrading from the previous single-recipient version:

1. **Environment Variable**: Update your `ALERT_RECEIVER` to include multiple emails if needed
2. **Code Compatibility**: All existing code will continue to work without changes
3. **Enhanced Features**: You can now use new features like custom alerts and runtime management

### Before (Single Recipient)
```bash
ALERT_RECEIVER="admin@example.com"
```

### After (Multiple Recipients)
```bash
ALERT_RECEIVER="admin@example.com support@example.com alerts@example.com"
```

## 🔧 Troubleshooting

### Common Issues

1. **No emails being sent**
   - Check that `ALERT_RECEIVER` contains valid email addresses
   - Verify EMAIL_USER and EMAIL_PASS are correctly set
   - Check application logs for validation warnings

2. **Some recipients not receiving emails**
   - Verify email addresses are correctly formatted
   - Check for typos in the ALERT_RECEIVER environment variable
   - Review logs for validation failures

3. **Email delivery failures**
   - Verify Gmail app password is correct
   - Check network connectivity
   - Review SMTP settings and authentication

### Debug Mode

Enable detailed logging by checking the application logs for mailer-related messages. All operations are logged with appropriate levels (INFO, WARN, ERROR).

---

**Note**: This service is designed for Gmail SMTP. For other email providers, update the transporter configuration in the `create()` method.
