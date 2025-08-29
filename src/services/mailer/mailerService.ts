// mailerService.ts
import nodemailer from 'nodemailer';
import { getConfig } from "@appConfig";
import logger from  "../../config/logger"

/**
 * MailerService - Enhanced Email Service with Multiple Recipients Support
 * 
 * Features:
 * - Support for multiple email recipients from environment variable
 * - Space-separated email addresses in ALERT_RECEIVER env variable
 * - Email validation and filtering
 * - Enhanced logging and error handling
 * - HTML email templates
 * 
 * Example usage:
 * 
 * Environment setup:
 * ALERT_RECEIVER="admin@example.com support@example.com alerts@example.com"
 * 
 * Code usage:
 * import MailerService from './mailerService';
 * 
 * async function main() {
 *   const mailer = await MailerService.create();
 *   await mailer.sendLowBalanceAlert(42.50, "0.0.123456");
 *   
 *   // Send to specific recipients
 *   await mailer.sendCustomAlert("Custom Alert", "Message", ["custom@example.com"]);
 * }
 * 
 * main();
 */

class MailerService {
    private transporter: nodemailer.Transporter | null = null;
    private emailUser = '';
    private alertReceivers: string[] = [];

    private constructor() {
        // Private constructor to prevent direct instantiation
    }

    static async create(): Promise<MailerService> {
        const instance = new MailerService();
        const config = await getConfig();
        instance.emailUser = config.mailer.emailUser;
        
        // Parse space-separated email addresses
        const receiverString = config.mailer.alertReceiver;
        instance.alertReceivers = receiverString
            .split(' ')
            .map(email => email.trim())
            .filter(email => email.length > 0 && instance.isValidEmail(email));

        if (instance.alertReceivers.length === 0) {
            logger.warn('No valid alert receiver emails found in ALERT_RECEIVER environment variable');
        } else {
            logger.info(`Configured ${instance.alertReceivers.length} alert receiver(s): ${instance.alertReceivers.join(', ')}`);
        }

        instance.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.mailer.emailUser,
                pass: config.mailer.emailPass
            }
        });

        return instance;
    }

    /**
     * Validates email format using a simple regex
     * @param email - Email address to validate
     * @returns boolean - True if email format is valid
     */
    private isValidEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    async sendLowBalanceAlert(currentBalance: number, account: string): Promise<void> {
        if (!this.transporter) {
            throw new Error('Transporter not initialized');
        }

        if (this.alertReceivers.length === 0) {
            logger.warn('No alert receivers configured. Skipping email alert.');
            return;
        }

        const mailOptions = {
            from: this.emailUser,
            to: this.alertReceivers.join(', '), // Send to all recipients
            subject: '⚠️ Escrow Account Low Balance',
            text: `Alert: The escrow account balance is low. Current balance: ${currentBalance} HBAR. Please top up the account ${account}.`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #ff6b35;">⚠️ Escrow Account Low Balance Alert</h2>
                    <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 5px; padding: 15px; margin: 20px 0;">
                        <p><strong>Alert:</strong> The escrow account balance is critically low.</p>
                        <p><strong>Current Balance:</strong> ${currentBalance} HBAR</p>
                        <p><strong>Account:</strong> ${account}</p>
                        <p style="color: #856404;"><strong>Action Required:</strong> Please top up the account immediately to prevent service disruption.</p>
                    </div>
                    <p style="font-size: 12px; color: #666;">This is an automated alert from the Hashbuzz dApp Backend system.</p>
                </div>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`Low balance alert email sent successfully to ${this.alertReceivers.length} recipient(s): ${this.alertReceivers.join(', ')}`);
            logger.info('Email delivery info: ' + info.response);
        } catch (error) {
            logger.err('Error sending low balance alert email: ' + String(error));
            throw error; // Re-throw to allow caller to handle the error
        }
    }

    /**
     * Send a custom alert email to specific recipients
     * @param subject - Email subject
     * @param message - Email message content
     * @param recipients - Optional array of specific email recipients. If not provided, uses configured alert receivers
     */
    async sendCustomAlert(subject: string, message: string, recipients?: string[]): Promise<void> {
        if (!this.transporter) {
            throw new Error('Transporter not initialized');
        }

        const emailRecipients = recipients || this.alertReceivers;
        
        if (emailRecipients.length === 0) {
            logger.warn('No recipients provided for custom alert. Skipping email.');
            return;
        }

        // Validate custom recipients if provided
        const validRecipients = recipients 
            ? recipients.filter(email => this.isValidEmail(email))
            : emailRecipients;

        if (validRecipients.length === 0) {
            logger.warn('No valid recipients found for custom alert. Skipping email.');
            return;
        }

        const mailOptions = {
            from: this.emailUser,
            to: validRecipients.join(', '),
            subject: `🔔 Hashbuzz Alert: ${subject}`,
            text: message,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #2d3436;">🔔 Hashbuzz Alert</h2>
                    <h3 style="color: #0984e3;">${subject}</h3>
                    <div style="background-color: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0;">
                        ${message.split('\n').map(line => `<p>${line}</p>`).join('')}
                    </div>
                    <p style="font-size: 12px; color: #666;">This is an automated alert from the Hashbuzz dApp Backend system.</p>
                </div>
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            logger.info(`Custom alert email sent successfully to ${validRecipients.length} recipient(s): ${validRecipients.join(', ')}`);
            logger.info('Email delivery info: ' + info.response);
        } catch (error) {
            logger.err('Error sending custom alert email: ' + String(error));
            throw error;
        }
    }

    /**
     * Get the list of configured alert receivers
     * @returns Array of configured email addresses
     */
    getAlertReceivers(): string[] {
        return [...this.alertReceivers]; // Return a copy to prevent external modification
    }

    /**
     * Add additional alert receivers at runtime
     * @param emails - Array of email addresses to add
     */
    addAlertReceivers(emails: string[]): void {
        const validEmails = emails.filter(email => this.isValidEmail(email));
        const newEmails = validEmails.filter(email => !this.alertReceivers.includes(email));
        
        this.alertReceivers.push(...newEmails);
        
        if (newEmails.length > 0) {
            logger.info(`Added ${newEmails.length} new alert receiver(s): ${newEmails.join(', ')}`);
        }
    }
}

export default MailerService;