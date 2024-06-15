import type { 
  CompletionItem,
  Connection,
  Diagnostic,
  DidChangeWatchedFilesParams,
  DidChangeConfigurationParams,
  DocumentDiagnosticReport,
  InitializeParams,
  InitializeResult,
  TextDocumentChangeEvent,
  TextDocumentPositionParams
} from 'vscode-languageserver/node';
import {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  DocumentDiagnosticReportKind,
  DidChangeConfigurationNotification,
  ProposedFeatures,
  TextDocuments,
  TextDocumentSyncKind,
} from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { EventEmitter, Exception } from '@blanquera/types';
import LanguageSettings from './LanguageSettings';

type ChangeEvent = TextDocumentChangeEvent<TextDocument>;

export type { 
  ChangeEvent,
  Diagnostic,
  InitializeParams,
  InitializeResult,
  DidChangeConfigurationParams,
  TextDocumentChangeEvent
};

export { 
  DiagnosticSeverity,
  CompletionItem,
  CompletionItemKind,
  TextDocument,
  TextDocumentPositionParams 
};

/**
 * Event wrapper for VSCode Language Server
 */
export default class LanguageServer extends EventEmitter<any[]> {
  //the server connection
  protected _connection: Connection|null = null;
  //list of open documents
  protected _documents: TextDocuments<TextDocument>|null = null;
  //custom language settings
  protected _settings: LanguageSettings;
  //has configuration capability
  protected _canConfigure = false;
  //has diagnostic related information capability
  protected _canDiagnose = false;
  //has workspace folder capability
  protected _inWorkspace = false;

  /**
   * Returns true if has configuration capability
   */
  public get canConfigure() {
    return this._canConfigure;
  }

  /**
   * Returns true if has diagnostic related information capability
   */
  public get canDiagnose() {
    return this._canDiagnose;
  }

  /**
   * Returns true if has workspace folder capability
   */
  public get inWorkspace() {
    return this._inWorkspace;
  }

  /**
   * Returns the server connection
   */
  public get connection() {
    if (!this._connection) {
      // Create a connection for the server, using Node's IPC as a transport.
      // Also include all preview / proposed LSP features.
      this._connection = createConnection(ProposedFeatures.all);
    }
    return this._connection;
  }

  /**
   * Returns the list of open documents
   */
  public get documents() {
    if (!this._documents) {
      // Create a simple text document manager.
      this._documents = new TextDocuments(TextDocument);
      // Only keep settings for open documents
      this._documents.onDidClose(e => {
        this.emitSync('document-close', e.document);
      });
      // The content of a text document has changed. This event is emitted
      // when the text document first opened or when its content has changed.
      this._documents.onDidChangeContent(change => {
        this.emitSync('content-change', change);
      });
    }

    return this._documents;
  }

  /**
   * Returns the custom language settings
   */
  public get settings() {
    return this._settings;
  }

  /**
   * Processes the initialization parameters
   */
  public constructor(settings: Record<string, any>) {
    super();
    this._settings = new LanguageSettings(this, settings);
  }

  /**
   * Starts the server
   */
  public listen() {
    this.connection.onInitialize((params: InitializeParams) => {
      const result = this._getCapabilities(params);
      this.emitSync('initialize', params, result);
      return result;
    });
    this.connection.onInitialized(() => {
      this._registerConfiguration();
      this.emitSync('initialized');
    });
    this.connection.onDidChangeConfiguration((change: DidChangeConfigurationParams) => {
      this.settings.reset(change.settings.languageServerExample);
      this.emitSync('configuration', change);
    });
    this.connection.languages.diagnostics.on(async (params) => {
      const document = this.documents.get(params.textDocument.uri);
      const diagnostics: Diagnostic[] = [];
      await this.emit('validate', document, diagnostics);

      if (document !== undefined) {
        return {
          kind: DocumentDiagnosticReportKind.Full,
          items: diagnostics
        } satisfies DocumentDiagnosticReport;
      } else {
        // We don't know the document. We can either try to read it from disk
        // or we don't report problems for it.
        return {
          kind: DocumentDiagnosticReportKind.Full,
          items: []
        } satisfies DocumentDiagnosticReport;
      }
    });

    this.connection.onDidChangeWatchedFiles((change: DidChangeWatchedFilesParams) => {
      this.emitSync('document-change', change);
    });
    
    // This handler provides the initial list of the completion items.
    this.connection.onCompletion((position: TextDocumentPositionParams) => {
      const items: CompletionItem[] = [];
      this.emitSync('suggest-list', position, items);
      return items;
    });
    
    // This handler resolves additional information for the item selected in
    // the completion list.
    this.connection.onCompletionResolve((item: CompletionItem) => {
      this.emitSync('suggest-info', item);
      return item;
    });
    
    // Make the text document manager listen on the connection
    // for open, change and close text document events
    this.documents.listen(this.connection);
    
    // Listen on the connection
    this.connection.listen();
  }

  /**
   * Called on initialize, this returns the server capabilities
   */
  protected _getCapabilities(params: InitializeParams) {
    const capabilities = params.capabilities;
  
    // Does the client support the `workspace/configuration` request?
    // If not, we fall back using global settings.
    this._canConfigure = !!(
      capabilities.workspace && !!capabilities.workspace.configuration
    );
    this._inWorkspace = !!(
      capabilities.workspace && !!capabilities.workspace.workspaceFolders
    );
    this._canDiagnose = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );
  
    const result: InitializeResult = {
      capabilities: {
        textDocumentSync: TextDocumentSyncKind.Incremental,
        // Tell the client that this server supports code completion.
        completionProvider: {
          resolveProvider: true
        }
      }
    };
    if (this._inWorkspace) {
      result.capabilities.workspace = {
        workspaceFolders: {
          supported: true
        }
      };
    }
    return result;
  }

  /**
   * Called on initialized, this registers the configuration
   */
  protected _registerConfiguration() {
    if (this._canConfigure) {
      // Register for all configuration changes.
      this.connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (this._inWorkspace) {
      this.connection.workspace.onDidChangeWorkspaceFolders(event => {
        this.emitSync('workspace-change', event);
      });
    }
  }
}

export function useBasic(
  server: LanguageServer, 
  parse: (document: TextDocument, settings: any, diagnostics: Diagnostic[]) => void
) {
  // - initialize example usage
  //server.on('initialize', (params: InitializeParams, result: InitializeResult) => {});
  // - initialized example usage
  //server.on('initialized', () => {});
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
  server.on('document-close', (e: ChangeEvent) => {
    server.settings.remove(e.document.uri);
  });
  // - content example usage
  server.on('content', (change: ChangeEvent) => {
    server.emit('validate', change.document);
  });
  // - suggest example usage
  server.on('suggest', (
    _textDocumentPosition: TextDocumentPositionParams, 
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
  server.on('validate', async (document: TextDocument, diagnostics: Diagnostic[] = []) => {
    // In this simple example we get the settings for every validate run.
    const settings = await server.settings.get(document.uri);

    try {
      parse(document, settings, diagnostics);
    } catch (e) {
      const error = e as Exception;
      const diagnostic: Diagnostic = {
        severity: DiagnosticSeverity.Error,
        message: error.message,
        range: {
          start: document.positionAt(error.start),
          end: document.positionAt(error.end)
        }
      };
      diagnostics.push(diagnostic);
    }

    // Send the computed diagnostics to VSCode.
    server.connection.sendDiagnostics({ uri: document.uri, diagnostics });
  });
}