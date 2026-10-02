import { Window } from '../layouts';
import { ContractLedgerContent } from './ContractLedger/ContractLedgerContent';

export const ContractLedger = () => (
  <Window title="Grand Contract Ledger" width={900} height={760}>
    <Window.Content fitted className="KeepService">
      <ContractLedgerContent />
    </Window.Content>
  </Window>
);
