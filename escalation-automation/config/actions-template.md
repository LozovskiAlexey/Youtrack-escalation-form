# How to Work with action.json

The **action.json** is used to define a set of actions available in a form. Each action appears as a selectable option for the user and controls how issues are created and processed.  
You can use the available template: _escalation-automation/config/actions-tmpl.json_  

## Structure description
* ***actions[]***: An array of available actions. Each action is rendered as a separate option in the form.

### Action Properties
* ***id***: A unique technical identifier for the action. You must define it yourself.
```json
"id": "escalate-to-development"
```

* ***title*** - The label displayed to the user in the form.
```json
"title": "Escalate to Development"
```
* ***sourceProject*** - The key of the source project.
```json
"sourceProject": "WS"
```

* ***targetProjectKey*** - The key of the target project where a new issue will be created.
```json
"targetProjectKey": "WEAP"
```

* ***visibleWhen*** - Conditions that determine when the action is available.
```json
"visibleWhen": {
  "State": "Confirmed",
  "Affected Area": "Backend"
}
```

### Form Configuration

* ***formFields*** - Defines custom fields shown in the form.
Supported field types:
  * select
  * text
  * checkbox

Example: 
```json
"formFields": [
        {
          "name": "issueType",
          "label": "Issue type",
          "type": "select",
          "required": true,
          "options": ["Bug", "Task"],
          "default": "Bug"
        },
        {
          "name": "reason",
          "label": "Escalation reason",
          "type": "text",
          "required": true
        }]
```

Access form values via **formFields[i].name**:  
Example: 
```
{{form.issueType}}
{{form.reason}}
{{form.includeSteps}}
```

### Issue Creation
* ***createIssue*** - Defines how the new issue is created. 

```json
"createIssue": {
  "summaryTemplate": "[Support {{source.idReadable}}] {{source.summary}}",
  "descriptionTemplate": "Created from {{source.idReadable}}",
  "state": "To Do"
}
```
```
⚠️ Note:
The state must exist in the target project and be available.
```
Example:  

<p align="center">
  <img src="https://github.com/user-attachments/assets/28b5956c-82e0-46ea-8592-2900fee5ad46" width="650"/>

</p>


### Field Mapping
* ***fieldMappings*** - Transfers custom fields from the source issue to the target issue.

Available modes: 
```
text
enumByName
enumMap
```

**text**: Used for plain text fields.
```json
{
  "from": "Reproduction Steps",
  "to": "Reproduction Steps",
  "mode": "text"
}
```

**enumByName**: Used when enum values have identical names in both projects.
```json
{
  "from": "Environment",
  "to": "Environment",
  "mode": "enumByName",
  "targetType": "SingleEnumIssueCustomField"
}
```
```
⚠️ Requirement: The value from the source project must exist in the target project's field bundle.
```

**enumMap** - Used when enum values differ between projects.
```json
{
  "from": "Customer Impact",
  "to": "Impact",
  "mode": "enumMap",
  "targetType": "SingleEnumIssueCustomField",
  "map": {
    "High": "Critical",
    "Medium": "Major",
    "Low": "Minor"
  }
}
```

### Description Sections
* ***descriptionSections*** - Adds structured sections to the target issue description based on source fields.
```json
{
  "title": "Expected result",
  "sourceField": "Expected Result"
}
```
**title** — section header in the target issue (Will be added to description of a target issue with this header)  
**sourceField** — name of the custom field in the source issue

Example:  
provide a pic


### Post-Submission Actions
* ***afterSubmit*** - Defines actions executed after the target issue is created.

Available actions: 
* **Link Issues**
```json
{
  "type": "linkIssues",
  "linkType": "relates to"
}
```

* **Update Source Issue State**
```json
{
  "type": "updateSourceState",
  "state": "Escalated to Dev"
}
```
```
⚠️ The state must exist and be available.
```

* **Add Comment to Source Issue**
```json
{
  "type": "commentSource",
  "template": "Created: {{target.idReadable}}"
}
```

### Template Variables
Template variables can be used in order to generate custom text templates for issue generation, with the help of templates admin is able to configure issue comments/summary/description or any test field, defined in actions
```
Source Issue
{{source.idReadable}}
{{source.summary}}
{{source.description}}
{{source.fields.Environment}}
{{source.fields.Customer Impact}}

Target Issue
{{target.idReadable}}

Form Values
{{form.issueType}}
{{form.reason}}
{{form.includeSteps}}
{{form.docType}}
{{form.details}}
```

```
⚠️ Important Rule: Custom fields must always be accessed using: {{source.fields.Field Name}}
```
