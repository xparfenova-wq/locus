# Weekly views of shared goals

The weekly screen selects active goals whose own year, quarter or month intersects the ISO week. An ISO week can span two calendar years. Each goal keeps its own identity, source and root period. The month, quarter and year follow the end of the intersection with that goal, not the ISO year or the current month. Invalid legacy periods are listed as unconfirmed rather than guessed.

`razrezy-celej` uses the same `okno-celej.rezultat` calculation as the goal window. Week cells show movement, explicit subperiod targets compare movement with the stored target, and root cells retain their own absolute plan and baseline. A monthly goal does not borrow a larger target from another goal. An absent starting observation is unknown. A present root baseline used without measurements is labelled as the initial baseline, never as a fresh measurement. Future windows do not borrow today's value.

Four cells use the canonical typography, spacing, borders and field radius. Desktop uses four columns and compact screens two; long source text wraps. Period links open the original goal with the exact window and cutoff date. Titles remain literal text. A closed root period does not offer quick measurement entry. Quick entry uses the shared measurement form and retains the original decimal string through validation.

New snapshots persist their period views only on an explicit save. Existing saved JSON is never augmented with current facts or targets. A legacy snapshot without period views says that they were not saved. Current and historical currency restrictions redact nested views as well as root values. No source or production business data is changed by reading the weekly report.
