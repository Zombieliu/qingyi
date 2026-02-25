export type WithdrawItem = {
  id: string;
  amount: number;
  status: string;
  account?: string;
  note?: string;
  createdAt: number;
};

export type TxItem = {
  id: string;
  type: string;
  amount: number;
  note?: string;
  createdAt: number;
};
