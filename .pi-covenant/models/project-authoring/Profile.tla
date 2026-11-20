---- MODULE Profile ----
VARIABLES version, reviewed, committed, accepted
Init == /\ version = 0
        /\ reviewed = 0
        /\ committed = FALSE
        /\ accepted = FALSE
Review == /\ ~accepted /\ ~committed
          /\ accepted' = TRUE /\ reviewed' = version
          /\ UNCHANGED <<version, committed>>
Edit == /\ version = 0 /\ ~committed
        /\ version' = 1
        /\ UNCHANGED <<reviewed, committed, accepted>>
Save == /\ accepted /\ reviewed = version /\ ~committed
        /\ committed' = TRUE
        /\ UNCHANGED <<version, reviewed, accepted>>
Idle == UNCHANGED <<version, reviewed, committed, accepted>>
Next == Review \/ Edit \/ Save \/ Idle
ReviewedSave == committed => (accepted /\ reviewed = version)
====
