# Truck Help — Development Instructions

## Owner and Purpose

Truck Help is an independent software project created and owned by Tony Marshall.

Tony is a broadcast/mobile-unit engineer working in live television production.

Truck Help is not an employer-owned internal application. It may eventually be licensed, sold, or developed into a commercial product.

Do not add employer ownership, employer copyright, proprietary branding, or assumptions about company ownership unless Tony explicitly requests it.


## What Truck Help Does

Truck Help is a mobile-friendly QR-based engineering assistance system for television production trucks.

Typical requester workflow:

SCAN QR
→ enter request
→ submit
→ engineering receives it
→ engineering manages it

The goal is to reduce people hunting for engineers, yelling down hallways, calling around the truck, or interrupting engineering personnel unnecessarily.

Requesters should experience very little friction.

Engineering personnel can have a more advanced workflow.


## Current Architecture

Truck Help is intentionally simple.

It is currently a static HTML/JavaScript application.

There is:

- no npm build process
- no package manager requirement
- no application framework
- no bundler

Primary live files include:

- index.html — public request form
- engineer.html — main engineering console
- cables.html — cable checkout/return interface
- signage.html — printable QR signage
- manifest.json — PWA manifest
- service-worker.js — service worker and push notification handling
- qrcode.min.js — QR generation library

Much of the application logic is inline in the HTML files.

Do not convert the project to React, Vue, Node, TypeScript, or another framework unless Tony explicitly decides to do so.


## Backend

The application uses Supabase.

The repository does NOT contain the complete Supabase backend configuration.

Database schema, RLS policies, RPC functions, storage configuration, backend notification sending, and other server-side configuration may exist only in Supabase.

Therefore:

DO NOT assume functionality is missing merely because its backend implementation is not present in GitHub.

Before changing anything involving:

- Supabase tables
- RLS
- RPC functions
- storage
- authentication
- push notification delivery
- database columns

ask Tony or inspect the relevant Supabase configuration.

Do not weaken security simply to make something work.


## Known Supabase Data

The current application references objects including:

- Shows
- Requests
- Engineers
- Show_Engineers
- Cable_Checkouts
- Engineering_Log
- Follow_Ups
- Request_Photos
- Push_Subscriptions

Storage includes request photo handling.

RPC functions referenced include:

- submit_truck_help_request
- take_cable_checkout
- return_cable_checkout

This list may evolve. Inspect current code before assuming it is complete.


## Current Major Features

Truck Help V1 is functional.

Current functionality includes approximately:

### Public Requester

- QR-based access
- active show detection
- requester name
- department
- physical location
- request description
- optional contact information where applicable
- request confirmation
- request number/tracking identification

Requester accounts are intentionally NOT required.


### Engineering Dashboard

- New requests
- In Progress requests
- Completed requests
- request tallies
- priority handling
- claiming requests
- taking over requests
- handing off requests
- completing requests
- engineer assignment
- active-show engineer validation
- All Requests / My Requests
- realtime request updates
- audible new-request notification


### Documentation

- resolution notes
- equipment/gear location
- request photos
- photo storage
- End-of-Show reporting
- Client Damage/Missing reporting
- follow-ups
- engineering log / handoff notes
- request history
- historical incident detail
- report printing


### Show Management

- active show
- show metadata
- engineer assignments
- show closeout
- open-request checks
- open-follow-up checks
- cable checks
- closeout notes
- archived show information
- previous show browsing


### Cable System

Current cable functionality includes TRIAX / TAC-12 related checkout and return workflows.

Cable checkout and return actions are performed in cables.html.

The engineering dashboard and show-closeout flow can display cable status and cables currently out, but they do not perform cable checkout or return actions.


### Notifications

Notification functionality has been developed and tested.

Known successful real-world testing includes:

- request notifications
- email notification delivery
- iPhone web push subscription
- iPhone lock-screen notification
- Apple Watch notification via paired iPhone

The GitHub repository contains the primary browser/client subscription and service-worker handling for push notifications.

Some related PWA/install assets or configuration may not be present in the repository, including notification icon assets and certain iOS home-screen metadata.

Backend push sending may exist outside this repository.

Push notifications have been successfully tested in real use on an iPhone lock screen and paired Apple Watch.

Do not conclude that push delivery is nonfunctional merely because some sender, Supabase, PWA, or deployment-side components are not stored in GitHub.


## Real-World Environment

Truck Help is intended to operate during live television productions.

Design priorities are:

1. Reliability
2. Speed
3. Clear controls
4. Mobile usability
5. Minimal requester friction

Users may be:

- outdoors
- in bright sunlight
- on an arena floor
- wearing gloves
- working under severe time pressure
- using inconsistent venue Wi-Fi or cellular service

Avoid unnecessary clicks.

Avoid tiny controls.

Avoid turning Truck Help into a generic corporate help-desk ticketing system.


## Priority Philosophy

Requesters do not determine operational priority.

Engineering determines whether something is:

- priority
- show-critical
- routine

Do not add requester-controlled emergency priority without Tony explicitly deciding to change this philosophy.


## Active Show Philosophy

The active-show system is important.

Truck Help is designed around actual productions rather than a single perpetual ticket queue.

Requests, engineering logs, reports, cable activity, follow-ups, and closeout information may be associated with a particular show.

Do not remove or simplify this concept without understanding its effects.


## Existing Backup / Legacy Files

The repository contains historical files such as:

- app.js
- app.before-v1.js
- index.before-v1.html
- engineer.before-v1.html
- engineer.before-followups.html
- style.before-v1.css

Other local development copies may use names containing:

.before-

Some of these are historical snapshots and are NOT the live application.

Do not assume app.js controls index.html.

Inspect HTML references before changing any apparent dependency.

Do not delete historical files merely because they appear unused unless Tony approves cleanup.


## Git Workflow

GitHub is the source of truth between computers and development assistants.

Repository:

tonytheguitargeek-lab/truck-help

Primary branch:

main

Tony's travel Mac development copy is normally:

~/Projects/truck-help

Before work:

git status
git pull
git log -5 --oneline

Before committing:

git diff
git status

Use meaningful commit messages.

Do not:

- force push main
- rewrite shared history
- delete remote history
- make destructive repository changes

without explicit approval.


## Development Rules

Truck Help currently works.

Do NOT rewrite functioning parts simply because another architecture appears more elegant.

Before significant changes:

1. Inspect the existing implementation.
2. Understand the current workflow.
3. Explain the proposed change.
4. Make the smallest practical change.
5. Test for regressions.
6. Commit only when the change is known to work.

Favor stability over refactoring.

Especially avoid casual changes to:

- request submission
- authentication
- active show handling
- realtime updates
- cable checkout/return
- photo storage
- reporting
- push notifications
- Supabase access


## Working With Tony

Tony prefers practical development over software-development ceremony.

When helping Tony:

- be direct
- explain what a change accomplishes
- give complete commands
- provide full copy/paste blocks
- avoid fragmentary patches when a full replacement is practical
- take one risky step at a time
- verify before proceeding

When Tony asks for a "full paste," provide the complete paste.


## Working With ChatGPT

ChatGPT is also being used as a development partner on Truck Help.

Claude and ChatGPT should use GitHub as their shared technical handoff.

Do not assume work produced by another AI assistant is wrong.

Inspect the actual code.

After substantial development work, give Tony:

1. What changed
2. Files changed
3. Database/Supabase changes required
4. How the change was tested
5. Git commit hash
6. Anything another developer or AI assistant needs to know


## Future Ideas

The following have been discussed but are NOT automatically approved for implementation:

- expanded cable inventory
- small-parts inventory
- equipment checkout
- camera case tracking
- high-value converter tracking
- loss/breakage workflow
- TM/client signatures
- engineer statistics
- department statistics
- training/how-to videos
- suggestion box
- supply inventory
- supply reorder reminders
- purchasing links
- Amazon reorder workflow
- automatic request assignment
- enhanced location handling
- multi-truck support
- commercial deployment

Tony decides when an idea becomes an active feature.


## Immediate Project State

Truck Help V1 is considered functional.

The current priority is real-world field testing on live productions.

Avoid feature creep immediately before a show.

Actual field feedback should drive the next development cycle.


## Guiding Principle

Truck Help exists to make engineering easier to reach without distracting engineers from doing their actual jobs.

Judge new features against that principle.
