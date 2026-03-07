-- Reverter dream6192: voltar para 2026-05-01
UPDATE customers SET due_date = '2026-05-01' WHERE id = '5b3ba340-9637-4fc0-b162-86d11175b1b4';

-- Corrigir 11858724: somar 30 dias (era 2027-01-26 -> 2027-02-26, mas como o pagamento era para ele)
UPDATE customers SET due_date = '2027-02-26' WHERE id = 'b8e75bae-b7a3-4237-8b75-a4f0b2077f3b';

-- Corrigir o payment_confirmation indevido
UPDATE payment_confirmations SET customer_id = 'b8e75bae-b7a3-4237-8b75-a4f0b2077f3b', customer_name = 'teste', new_due_date = '2027-02-26' WHERE id = '53984e59-0ebe-4e5b-8665-c4aee70850d0';

-- Corrigir o payment indevido
UPDATE payments SET customer_id = 'b8e75bae-b7a3-4237-8b75-a4f0b2077f3b' WHERE id = 'e39bb31f-7b40-41b1-8f99-e0f34b70f2a0';