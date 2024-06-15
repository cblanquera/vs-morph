import type { 
  ChangeEvent,
  TextDocument,
  Diagnostic,
  InitializeParams,
  InitializeResult,
  DidChangeConfigurationParams
} from '../../../dist/LanguageServer';

import LanguageServer, { 
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams 
} from '../../../dist/LanguageServer';

const server = new LanguageServer({ maxNumberOfProblems: 1000 });

// - initialize example usage
server.on('initialize', (
  params: InitializeParams, 
  result: InitializeResult
) => {
  server.connection.console.log('Initialized.');
});

// - initialized example usage
server.on('initialized', () => {
  server.connection.console.log('Initialized.');
});

// - configuration example usage
server.on('configuration', (change: DidChangeConfigurationParams) => {
  // Revalidate all open text documents
  server.documents.all().forEach(document => {
    server.emit('validate', document);
  });
});

// - workspace-change example usage
server.on('workspace-change', _change => {
  // Monitored files have change in VSCode
  server.connection.console.log('Workspace folder change event received.');
});

// - document-change example usage
server.on('document-change', _change => {
  // Monitored files have change in VSCode
  server.connection.console.log('We received an file change event');
});

// - document-close example usage
server.on('document-close', (event: ChangeEvent) => {
  server.settings.remove(event.document.uri);
});

// - content example usage
server.on('content-change', (event: ChangeEvent) => {
  server.emit('validate', event.document);
});

// - suggest example usage
server.on('suggest-list', (
  textDocumentPosition: TextDocumentPositionParams, 
  suggestions: CompletionItem[]
) => {
  // The pass parameter contains the position of the text document in
  // which code complete got requested. For the example we ignore this
  // info and always provide the same completion items.
  suggestions.push({
    label: 'TypeScript',
    kind: CompletionItemKind.Text,
    data: 1
  },
  {
    label: 'JavaScript',
    kind: CompletionItemKind.Text,
    data: 2
  });
});

// - suggest-info example usage
server.on('suggest-info', (item: CompletionItem) => {
  if (item.data === 1) {
    item.detail = 'TypeScript details';
    item.documentation = 'TypeScript documentation';
  } else if (item.data === 2) {
    item.detail = 'JavaScript details';
    item.documentation = 'JavaScript documentation';
  }
});

// - validate example usage
server.on('validate', async (
  document: TextDocument, 
  diagnostics: Diagnostic[] = []
) => {
  // In this simple example we get the settings for every validate run.
  const settings = await server.settings.get(document.uri);

  // The validator creates diagnostics for all uppercase words length 2 and more
  const text = document.getText();

  const pattern = /\b[A-Z]{2,}\b/g;
  let m: RegExpExecArray | null;

  let problems = 0;
  while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
    problems++;
    const diagnostic: Diagnostic = {
      severity: DiagnosticSeverity.Warning,
      range: {
        start: document.positionAt(m.index),
        end: document.positionAt(m.index + m[0].length)
      },
      message: `${m[0]} is all uppercase.`,
      source: 'ex'
    };
    if (server.canDiagnose) {
      diagnostic.relatedInformation = [
        {
          location: {
            uri: document.uri,
            range: Object.assign({}, diagnostic.range)
          },
          message: 'Spelling matters'
        },
        {
          location: {
            uri: document.uri,
            range: Object.assign({}, diagnostic.range)
          },
          message: 'Particularly for names'
        }
      ];
    }
    diagnostics.push(diagnostic);
  }

  // Send the computed diagnostics to VSCode.
  server.connection.sendDiagnostics({ uri: document.uri, diagnostics });
});

server.listen();