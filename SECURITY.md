# Security Policy

## Supported Versions

Security updates are provided for the latest release of Reel Scroller and the current development branch.

| Version | Supported |
|---------|-----------|
| 0.2.1   | Yes       |
| older   | No        |

## Reporting a Vulnerability

If you believe you have found a security issue in Reel Scroller, please report it privately to the maintainer instead of opening a public issue.

Private contact method:
- joeurcino@proton.me

Include:
- a clear description of the issue
- steps to reproduce it
- affected browser version
- affected extension version
- any relevant screenshots, logs, or sample code

Please avoid sharing any exploit details publicly until the issue has been reviewed and addressed.

## Scope

Reel Scroller is a Firefox extension that:
- runs only on Instagram pages
- auto-scrolls Reels when the current video ends
- skips visibly sponsored Reels
- stores only a local on/off preference in Firefox extension storage

The extension does not collect user data according to the repository documentation.

## Security Principles

Reel Scroller follows these principles:
- minimal data storage
- least-privilege permissions where practical
- no remote code execution
- no collection of personal data
- no transmission of browsing data to external servers

## What to Report

Please report issues such as:
- unauthorized data access
- permission abuse
- unexpected network requests
- code execution vulnerabilities
- cross-site impact outside Instagram
- persistence or storage issues
- problems that could expose local extension data

## Out of Scope

The following are generally not considered security vulnerabilities:
- feature requests
- cosmetic bugs
- Instagram layout changes that break ad detection or scrolling
- normal autoplay behavior differences between browsers
- issues caused by third-party changes on Instagram

## Disclosure Policy

Confirmed vulnerabilities will be fixed in a future release and disclosed after a reasonable remediation period.
