# Admins see finance data by default (revocable), not least-privilege

A security review would expect aggregate revenue to be hidden from admins until explicitly granted (least privilege). We deliberately chose the opposite: `dashboard:finance:view` and `reports:finance:view` default **on** for admins, and the owner can revoke them per admin with the "Can see money numbers" Access switch.

Reason: the product's owners are ~40-year-old non-technical gym operators, and simplicity beats least privilege here — flipping the default off would have silently removed revenue visibility every existing admin has today, generating support confusion for a risk the owner can already manage with one switch. Recorded because the next security-minded reader will assume this default is an oversight; it is not.
