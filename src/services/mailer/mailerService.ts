// mailerService.ts
import nodemailer from 'nodemailer';
import { getConfig } from "@appConfig";

/**
 * Example usage:
 * 
 * import MailerService from './mailerService';
 * 
 * async function main() {
 *   const mailer = await MailerService.create();
 *   await mailer.sendLowBalanceAlert(42.50);
 * }
 * 
 * main();
 */

class MailerService {
    private transporter: nodemailer.Transporter | null = null;
    private emailUser: string = '';
    private alertReceiver: string = '';

    private constructor() {}

    static async create(): Promise<MailerService> {
        const instance = new MailerService();
        const config = await getConfig();
        instance.emailUser = config.mailer.emailUser;
        instance.alertReceiver = config.mailer.alertReceiver;

        instance.transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: config.mailer.emailUser,
                pass: config.mailer.emailPass
            }
        });

        return instance;
    }

    async sendLowBalanceAlert(currentBalance: number, account: string): Promise<void> {
        if (!this.transporter) {
            throw new Error('Transporter not initialized');
        }

        const mailOptions = {
            from: this.emailUser,
            to: this.alertReceiver,
            subject: '⚠️ Escrow Account Low Balance',
            text: `Alert: The escrow account balance is low. Current balance: ${currentBalance} HBAR. Please top up the account ${account}.`
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('Email sent: ' + info.response);
        } catch (error) {
            console.error('Error sending email:', error);
        }
    }
}

export default MailerService;