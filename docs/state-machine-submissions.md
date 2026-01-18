```mermaid
stateDiagram-v2
  [*] --> Pending : user submits

  Pending --> Approved : admin approves
  Pending --> Rejected : admin rejects
  Pending --> PendingMoreInfo : needs info (optional)

  PendingMoreInfo --> Pending : user resubmits/adds info
  Approved --> Promoted : reflected into places/media/payment_accepts/socials
  Rejected --> [*]
  Promoted --> [*]

```
