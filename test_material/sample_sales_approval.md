# Client Requirements — Sales Order Approval (Odoo)

**Client:** Meridian Furnishings (wholesale furniture)
**Prepared by:** Business Analyst — discovery meeting notes
**Module area:** Odoo Sales

## Background

Meridian's sales team creates quotations in Odoo and confirms them into sales orders themselves.
Management has no control over large or heavily-discounted deals, which has caused margin loss and a
few orders being shipped that were never really approved. They want an **approval workflow** added to
the Odoo sales process.

## Meeting notes

**Sales Manager (Priya):**
"Right now any salesperson can confirm a quotation of any value. I need to review the big ones before
they go out. Anything over **$10,000** should come to me for approval. Also, if a salesperson gives a
discount of more than **15%**, I want to approve that too — even if the order is small."

"When something needs my approval, the order should be locked so it can't be confirmed until I say
yes. I'd like an email when there's something waiting for me."

"If I reject it, the salesperson should see my reason and be able to edit and resubmit."

**Salesperson (Tom):**
"Most of my orders are small and routine — I don't want to wait for approval on a $500 order. Those
should just go through like today."

"I'd like to see the status on the quotation — like 'Waiting Approval', 'Approved', or 'Rejected' —
so I know where it stands."

**Finance (Dana):**
"For anything above **$50,000**, I want finance to also sign off after the sales manager, because those
affect credit exposure. So the really big deals need two approvals."

"We should keep a record of who approved what and when, for audit."

## Rules discussed

- Orders **≤ $10,000** and discount **≤ 15%**: no approval needed (auto, as today).
- Orders **> $10,000** OR discount **> 15%**: require **Sales Manager** approval.
- Orders **> $50,000**: require **Sales Manager** approval, then **Finance** approval (two steps).
- A quotation pending approval **cannot be confirmed** until approved.
- On rejection, the approver must give a reason; the salesperson can edit and resubmit.
- Notifications by email to the relevant approver when an order is waiting.
- Keep an approval history (approver, decision, reason, timestamp).

## Out of scope (for now)

- Mobile app approvals.
- Integration with any external ERP.
- Approvals for purchase orders or expenses (this is sales only).

## Open questions

- Should the $ thresholds be configurable per company, or fixed?
- Who approves when the Sales Manager is on leave (delegate)?
- Are the thresholds based on order total before or after tax?
