import { TransactionEvents } from '@V201/events/transaction';

export type TransactionEventsloadMap = {
  [TransactionEvents.TRANSACTION_TOPUP_INIATE]: {
    transactionId: string;
  };
};
