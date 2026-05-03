# YouTrack Escalation Form

A configurable YouTrack App that adds custom action forms to issues and creates target issues in another project using a reusable JSON configuration.
Demo: [Video](https://drive.google.com/file/d/10spDqEug5Ac9glzus9drfszShY4dBqLC/view?usp=drive_link)

## Problem Statement

During the development of the Weather application, two separate projects were created in YouTrack:

- **Weather App (WEAP)** — development project
- **Weather Support (WS)** — support project

The support team regularly escalates issues to the development team. However, the standard process required:

- manually creating a new issue in the development project
- copying description and relevant fields
- linking issues
- adding comments
- updating the source issue state

This process was repetitive, time-consuming, and error-prone.

## Limitations of Native YouTrack Workflows

During implementation, several limitations of the built-in YouTrack automation were identified:

1. **No support for rich custom forms in workflows**
   - Workflows do not provide UI forms with multiple structured inputs.
   - It is not possible to collect multiple parameters from the user at once.

2. **Limited control over field values**
   - Even when using custom fields, workflows do not enforce value constraints based on another project.
   - It is not possible to dynamically align field values between projects.

3. **Poor reusability**
   - Workflow logic is tightly coupled with specific projects and fields.
   - Reusing the same escalation logic across projects is difficult.

## Solution

To address these limitations, a custom YouTrack App was developed.

The solution introduces:

- A **custom action form** embedded directly in the issue menu
- A **config-driven architecture** using `actions.json`
- A **bridge backend service** for interaction with YouTrack API

## Key Features

- Collect multiple user inputs via a structured form (select, text, checkbox)
- Dynamically control action availability based on issue fields (`visibleWhen`)
- Create issues in another project using templates
- Map and transform custom fields between projects
- Build structured descriptions using sections
- Link source and target issues automatically
- Add comments and update issue states
- Fully reusable configuration via JSON

## Result

The escalation process becomes:

1. Open a support issue
2. Click **Custom Action**
3. Fill in the form
4. Submit

And the system automatically:
- creates a development issue
- transfers required data
- links issues
- updates the support issue

## Local setup

Clone repository, then start setting project up according to your needs, hope this will be helpful:) 

1. Create .env
```
PORT=3005
YOUTRACK_BASE_URL=https://your-youtrack-instance
YOUTRACK_TOKEN=perm:your-token
```

2. Run server
```
cd escalation-automation
npm install
node server.js
```
Check health:
```bash
curl http://localhost:3005/health
```
Expected result: 
```json
{
  "ok": true,
  "service": "youtrack-action-form-bridge"
}
```
3. Expose localhost with ngrok
```bash
ngrok http 3005
```
Copy the HTTPS forwarding URL, this will be Used as _**bridgeUrl**_ in YouTrack App settings

## Configure actions 
Configuration process of constructing **actions.json** file is described in [Docs](./escalation-automation/config/actions-template.md)

1. Configure actions.json
2. Put your actions.json in a public GitHub repository and use the raw URL
```
Example link: https://raw.githubusercontent.com/<user>/<repo>/<branch>/actions.json
```
This value will be used as _**configUrl**_ 

## Build and upload the YouTrack App 

The app package must contain: 
 - manifest.json
 - settings.json
 - settings-handler.js
 - widgets/escalation-form/index.html

Go to prject root, there is a Makefile configured to prepare zip file, it supports two options:
  * build: generates new zip file from the required files
  * clean: removes the old zip file
```
Pay attemtion: once you've updated any of youtrack-escalation-app files make sure you've updated "version" in youtrack-escalation-app/manifest.json. Otherwise changes will not be applied
```
Upload zip to YouTrack (Administration → Apps → Upload App)
After uploading, open app settings and configure: _**configUrl**_ , _**bridgeUrl**_ in app settings tab

## Notes
 - Custom field names are case-sensitive.
 - Enum values must exist in the target project field bundle.
 - Required target fields must either be filled by fieldMappings or made optional.
 - The bridge server keeps the YouTrack token outside the browser.
