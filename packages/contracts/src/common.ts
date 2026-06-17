export type ISODateString = string;
export type UUID = string;

export interface AuditStamp {
  createdAt: ISODateString;
  updatedAt?: ISODateString | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface MoneyAmount {
  amount: number;
  currency: 'TRY' | 'USD' | 'EUR' | string;
}

export interface UsageCounter {
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}
