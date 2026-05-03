// load .env
require('dotenv').config();

// create web server
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning']
}));

// makes server accept json
app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

const {
  PORT = 3005,
  YOUTRACK_BASE_URL,
  YOUTRACK_TOKEN,
} = process.env;

// health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'youtrack-action-form-bridge',
  });
});

app.post('/api/action-submit', async (req, res) => {
  try {
    const { action, sourceIssueId, form } = req.body;

    if (!action || !sourceIssueId || !form) {
      return res.status(400).json({
        error: 'Missing action, sourceIssueId or form'
      });
    }

    const resolvedAction = action;

    if (!resolvedAction) {
      return res.status(400).json({
        error: 'Missing action or actionId'
      });
    }

    const source = await youtrackGet(
      `/api/issues/${encodeURIComponent(sourceIssueId)}?fields=id,idReadable,summary,description,fields(name,value(id,name,localizedName,presentation,text,markdownText,login,fullName,idReadable))`
    );

    validateVisibleWhen(source, resolvedAction.visibleWhen);
    validateRequiredFields(resolvedAction.formFields, form);

    const targetIssue = await createTargetIssue(resolvedAction, source, form);

    await runAfterSubmitActions(resolvedAction, source, targetIssue, form);

    return res.json({
      ok: true,
      createdIssue: targetIssue.idReadable
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message
    });
  }
});

// check access from the automation account
app.get('/api/me', async (req, res) => {
  try {
    const user = await youtrackGet('/api/users/me?fields=login,name');
    res.json(user);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

async function youtrackGet(path) {
  const response = await fetch(`${YOUTRACK_BASE_URL}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${YOUTRACK_TOKEN}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`YouTrack API error ${response.status}: ${body}`);
  }

  return response.json();
}

async function youtrackPost(path, body) {
  const response = await fetch(`${YOUTRACK_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${YOUTRACK_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTrack POST error ${response.status}: ${text}`);
  }

  return response.json();
}

async function applyCommand(issueId, query) {
  return youtrackPost('/api/commands?fields=id', {
    query,
    issues: [
      {
        idReadable: issueId,
      },
    ],
  });
}

function validateVisibleWhen(issue, visibleWhen = {}) {
  for (const [fieldName, expectedValue] of Object.entries(visibleWhen)) {
    const actualValue = getFieldValue(issue, fieldName);

    if (actualValue !== expectedValue) {
      throw new Error(
        `Action is not available: ${fieldName} must be ${expectedValue}, current value is ${actualValue || 'empty'}`
      );
    }
  }
}

function validateRequiredFields(formFields = [], form = {}) {
  for (const field of formFields) {
    if (!field.required) {
      continue;
    }

    const value = form[field.name];

    if (
      field.type !== 'checkbox' &&
      (value === undefined || value === null || String(value).trim() === '')
    ) {
      throw new Error(`${field.label} is required`);
    }
  }
}

async function createTargetIssue(action, source, form) {
  const customFields = [
    {
      name: 'Type',
      $type: 'SingleEnumIssueCustomField',
      value: {
        name: form.issueType || 'Task'
      }
    },
    {
      name: 'State',
      $type: 'StateMachineIssueCustomField',
      value: {
        name: action.createIssue.state
      }
    }
  ];

  for (const mapping of action.fieldMappings || []) {
    const customField = buildCustomFieldFromMapping(source, mapping, form);

    if (customField) {
      customFields.push(customField);
    }
  }

  return youtrackPost('/api/issues?fields=id,idReadable', {
    project: {
      shortName: action.targetProjectKey
    },
    summary: renderTemplate(action.createIssue.summaryTemplate, {
      source,
      form
    }),
    description: buildDescription(action, source, form),
    customFields
  });
}

function buildCustomFieldFromMapping(source, mapping, form) {
  if (!conditionMatches(mapping.onlyWhen, form)) {
    return null;
  }

  const field = source.fields?.find((item) => item.name === mapping.from);
  const sourceValue = field?.value;

  if (!sourceValue) {
    if (mapping.fallback && mapping.mode === 'text') {
      return {
        name: mapping.to,
        $type: mapping.targetType || 'TextIssueCustomField',
        value: {
          text: renderTemplate(mapping.fallback, { source, form })
        }
      };
    }

    if (mapping.required) {
      throw new Error(`Required source field is empty: ${mapping.from}`);
    }

    return null;
  }

  if (mapping.mode === 'text') {
    const text = getTextFieldValue(sourceValue);

    if (!text && mapping.fallback) {
      return {
        name: mapping.to,
        $type: mapping.targetType || 'TextIssueCustomField',
        value: {
          text: renderTemplate(mapping.fallback, { source, form })
        }
      };
    }

    return {
      name: mapping.to,
      $type: mapping.targetType || 'TextIssueCustomField',
      value: {
        text
      }
    };
  }

  if (mapping.mode === 'enumByName') {
    const name = getEnumFieldName(sourceValue);

    if (!name) {
      if (mapping.required) {
        throw new Error(`Cannot read enum value from field: ${mapping.from}`);
      }

      return null;
    }

    return {
      name: mapping.to,
      $type: mapping.targetType || 'SingleEnumIssueCustomField',
      value: {
        name
      }
    };
  }

  if (mapping.mode === 'enumMap') {
    const sourceName = getEnumFieldName(sourceValue);
    const targetName = mapping.map?.[sourceName];

    if (!targetName) {
      if (mapping.required) {
        throw new Error(`No mapping for ${mapping.from}: ${sourceName || 'empty'}`);
      }

      return null;
    }

    return {
      name: mapping.to,
      $type: mapping.targetType || 'SingleEnumIssueCustomField',
      value: {
        name: targetName
      }
    };
  }

  throw new Error(`Unsupported field mapping mode: ${mapping.mode}`);
}

async function runAfterSubmitActions(action, source, target, form) {
  for (const step of action.afterSubmit || []) {
    console.log('Running afterSubmit step:', step);

    if (step.type === 'linkIssues') {
      await applyCommand(source.idReadable, `${step.linkType} ${target.idReadable}`);
    }

    if (step.type === 'updateSourceState') {
      await applyCommand(source.idReadable, `State ${step.state}`);
    }

    if (step.type === 'commentSource') {
      await youtrackPost(
        `/api/issues/${encodeURIComponent(source.idReadable)}/comments`,
        {
          text: renderTemplate(step.template, {
            source,
            target,
            form
          })
        }
      );
    }
  }
}

function conditionMatches(condition = {}, form = {}) {
  for (const [key, expectedValue] of Object.entries(condition)) {
    if (key.startsWith('form.')) {
      const fieldName = key.slice('form.'.length);

      if (form[fieldName] !== expectedValue) {
        return false;
      }
    }
  }

  return true;
}

function renderTemplate(template = '', context = {}) {
  const normalizedContext = normalizeTemplateContext(context);

  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, rawPath) => {
    const path = rawPath.trim();
    const value = getValueByPath(normalizedContext, path);

    return stringifyTemplateValue(value);
  });
}

function getFieldValue(issue, fieldName) {
  const field = issue.fields?.find((item) => item.name === fieldName);
  return getEnumFieldName(field?.value) || getTextFieldValue(field?.value) || null;
}

function getFieldText(issue, fieldName) {
  const field = issue.fields?.find((item) => item.name === fieldName);
  return getTextFieldValue(field?.value);
}

function getTextFieldValue(value) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(getTextFieldValue)
      .filter(Boolean)
      .join(', ');
  }

  return value.text || value.markdownText || value.presentation || '';
}

function getEnumFieldName(value) {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map(getEnumFieldName)
      .filter(Boolean)
      .join(', ');
  }

  return value.name || value.localizedName || value.presentation || null;
}

// function buildDescription(action, source, form) {
//   let description = renderTemplate(action.createIssue.descriptionTemplate, {
//     source,
//     form
//   });

//   for (const section of action.descriptionSections || []) {
//     if (!conditionMatches(section.includeWhen, form)) {
//       continue;
//     }

//     const value = getFieldText(source, section.sourceField);

//     if (!value) {
//       continue;
//     }

//     description += `\n\n${section.title}:\n${value}`;
//   }

//   return description;
// }

function buildDescription(action, source, form) {
  let description = renderTemplate(action.createIssue.descriptionTemplate, {
    source,
    form
  });

  for (const section of action.descriptionSections || []) {
    if (!conditionMatches(section.includeWhen, form)) {
      continue;
    }

    let value = '';

    if (section.source === 'description') {
      value = source.description;
    } else {
      value = getFieldText(source, section.sourceField);
    }

    if (!value) {
      continue;
    }

    description += `\n\n${section.title}:\n${value}`;
  }

  return description;
}

function normalizeTemplateContext(context = {}) {
  return {
    ...context,
    source: normalizeIssueForTemplates(context.source),
    target: normalizeIssueForTemplates(context.target),
    form: context.form || {}
  };
}

function normalizeIssueForTemplates(issue) {
  if (!issue) {
    return {};
  }

  const normalizedFields = {};

  for (const field of issue.fields || []) {
    normalizedFields[field.name] =
      getTextFieldValue(field.value) ||
      getEnumFieldName(field.value) ||
      field.value;
  }

  return {
    ...issue,
    fields: normalizedFields
  };
}

function getValueByPath(object, path) {
  const parts = path.split('.');
  let value = object;

  for (const part of parts) {
    if (value === undefined || value === null) {
      return undefined;
    }

    value = value[part];
  }

  return value;
}

function stringifyTemplateValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map(stringifyTemplateValue)
      .filter(Boolean)
      .join(', ');
  }

  return (
    value.idReadable ||
    value.name ||
    value.localizedName ||
    value.presentation ||
    value.text ||
    value.markdownText ||
    ''
  );
}

app.listen(PORT, () => {
  console.log(`Action Form Bridge is running on http://localhost:${PORT}`);
});