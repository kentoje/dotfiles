---- MODULE DuplicateDraft ----
VARIABLES explicit, scoped, checked, pushed, duplicate, delivery, head, review, ci, ready, stopped
Init == /\ explicit = FALSE /\ scoped = FALSE /\ checked = FALSE /\ pushed = FALSE /\ duplicate = TRUE /\ delivery = "none" /\ head = "A" /\ review = "unknown" /\ ci = "unknown" /\ ready = FALSE /\ stopped = FALSE
Authorize(d) == /\ ~explicit /\ explicit' = TRUE /\ scoped' = TRUE /\ duplicate' = d /\ UNCHANGED <<checked,pushed,delivery,head,review,ci,ready,stopped>>
Check == /\ explicit /\ scoped /\ ~stopped /\ checked' = TRUE /\ UNCHANGED <<explicit,scoped,pushed,duplicate,delivery,head,review,ci,ready,stopped>>
Push == /\ explicit /\ scoped /\ checked /\ ~stopped /\ pushed' = TRUE /\ UNCHANGED <<explicit,scoped,checked,duplicate,delivery,head,review,ci,ready,stopped>>
Deliver == /\ explicit /\ pushed /\ ~stopped /\ delivery = "none" /\ delivery' = "draft" /\ UNCHANGED <<explicit,scoped,checked,pushed,duplicate,head,review,ci,ready,stopped>>
ObserveReview == /\ delivery # "none" /\ ~stopped /\ review' = head /\ UNCHANGED <<explicit,scoped,checked,pushed,duplicate,delivery,head,ci,ready,stopped>>
ObserveCi == /\ delivery # "none" /\ ~stopped /\ ci' = head /\ UNCHANGED <<explicit,scoped,checked,pushed,duplicate,delivery,head,review,ready,stopped>>
Repair == /\ head = "A" /\ delivery # "none" /\ ~ready /\ ~stopped /\ head' = "B" /\ checked' = FALSE /\ pushed' = FALSE /\ UNCHANGED <<explicit,scoped,duplicate,delivery,review,ci,ready,stopped>>
Ready == /\ ~stopped /\ delivery # "none" /\ checked /\ pushed /\ review = head /\ ci = head /\ ready' = TRUE /\ UNCHANGED <<explicit,scoped,checked,pushed,duplicate,delivery,head,review,ci,stopped>>
Stop == /\ ~ready /\ stopped' = TRUE /\ UNCHANGED <<explicit,scoped,checked,pushed,duplicate,delivery,head,review,ci,ready>>
Next == (\E d \in BOOLEAN: Authorize(d)) \/ Check \/ Push \/ Deliver \/ ObserveReview \/ ObserveCi \/ Repair \/ Ready \/ Stop \/ UNCHANGED <<explicit,scoped,checked,pushed,duplicate,delivery,head,review,ci,ready,stopped>>
ExplicitEffects == delivery # "none" => (explicit /\ scoped)
NoDuplicate == delivery = "draft" => ~duplicate
FreshEvidence == ready => (review = head /\ ci = head)
CheckedBeforeReady == ready => (checked /\ pushed /\ ~stopped)
====
