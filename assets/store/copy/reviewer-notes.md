# Review access: private console fields only

The app is a native shell around https://uclvolunteering.org. Most of it needs
no account:

- **Calendar** (first tab): week and list views of public Volunteering events
- **Food waste** (third tab): the Zero Food Waste shift log, no sign-in

Sign-in is only needed for the **Volunteer** tab (join the volunteer list) and
the committee planning portal. Sign-in is UCL single sign-on through Adam's
Campus Toolbox, which reviewers cannot complete with a UCL account of their own

Use the Toolbox store-reviewer accounts, as for the other Toolbox apps:
`apple@adamscampustoolbox.org.uk` in App Store Connect → App Review Information,
and `android@adamscampustoolbox.org.uk` in Google Play Console → App content →
App access. Their passwords come from the Toolbox repo's
`scripts/seed-review-accounts.ts`; enter them only in those console fields,
never in the description, screenshots or this repository. Confirm both
accounts can sign in to uclvolunteering.org before submitting, and give them
committee access in the portal's Members page if you want review to cover the
committee tools

## Notes to paste after confirming the accounts work

```
VolSoc is the app for the UCL Volunteering Society, a student society at
University College London

No sign-in is needed for the Calendar tab (Volunteering events from UCL
societies) or the Food waste tab (shift leaders log food they collected)

To test sign-in: open the Volunteer tab, tap "Continue with UCL sign-in" and
use the review account in these notes. You can then fill in and submit the
volunteer form; tapping it again later updates the same entry, and the form
lets you remove yourself from the list

Please don't submit test entries on the Food waste tab: they go straight to
the society's live tracking sheet. The form can be filled in without
submitting
```

## Before submitting

- The privacy policy URL (https://uclvolunteering.org/privacy) must exist
- Apple guideline 5.1.1(v): the app creates a member record on sign-in, so
  there must be a way to delete it from inside the app (the volunteer form's
  remove option covers the sign-up, not the member record)
- Support email `support@uclvolunteering.org` must receive mail
