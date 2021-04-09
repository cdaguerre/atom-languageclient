import type * as atomIde from "atom-ide-base"
import * as lsp from "vscode-languageserver-protocol"
import Convert from "../convert"
import { TextBuffer, TextEditor } from "atom"
import * as fs from 'fs';
const fsPromises = fs.promises;

export default class WorkspaceEditHandler {

  public static async handle(workspaceEdit: lsp.WorkspaceEdit): Promise<lsp.ApplyWorkspaceEditResponse> {
    const changes = WorkspaceEditHandler.normalizeChanges(workspaceEdit)

    return WorkspaceEditHandler.handleDocumentChanges(changes)
  }

  private static normalizeChanges(workspaceEdit: lsp.WorkspaceEdit): (lsp.TextDocumentEdit | lsp.CreateFile | lsp.RenameFile | lsp.DeleteFile)[] {
    let changes = workspaceEdit.documentChanges || [];

    if (!workspaceEdit.hasOwnProperty('documentChanges') && workspaceEdit.hasOwnProperty('changes')) {
      const uris = Object.keys(workspaceEdit.changes || [])
      uris.forEach((uri: lsp.DocumentUri) => {
        changes.push({
          textDocument: {
            version: null,
            uri: uri
          },
          edits: workspaceEdit.changes![uri]
        })
      })
    }

    return changes
  }

  public static async handleDocumentChanges (changes: (lsp.TextDocumentEdit | lsp.CreateFile | lsp.RenameFile | lsp.DeleteFile)[]): Promise<lsp.ApplyWorkspaceEditResponse> {
    const checkpoints: Array<{ buffer: TextBuffer; checkpoint: number }> = []

    const promises = changes.map(async (edit): Promise<void> => {
      if (WorkspaceEditHandler.isTextDocumentEdit(edit)) {
        const buffer = await WorkspaceEditHandler.getBuffer(edit.textDocument.uri)
        const checkpoint = WorkspaceEditHandler.handleTextDocumentEdit(buffer, edit)

        checkpoints.push({ buffer, checkpoint })
      } else {
        WorkspaceEditHandler.handleResourceOperation(edit)
      }
    })

    // Apply all edits or fail and revert everything
    const applied = await Promise.all(promises)
      .then(() => true)
      .catch((err) => {
        atom.notifications.addError("workspace/applyEdits failed", {
          description: "Failed to apply edits.",
          detail: err.message,
        })
        checkpoints.forEach(({ buffer, checkpoint }) => {
          buffer.revertToCheckpoint(checkpoint)
        })
        return false
      })

    return { applied }
  }

  public static async handleResourceOperation(edit: (lsp.CreateFile | lsp.RenameFile | lsp.DeleteFile)): Promise<void>
  {
    if (edit.kind === 'delete') {
      return fsPromises.unlink(Convert.uriToPath(edit.uri))
    } else if (edit.kind === 'rename') {
      console.log('Renaming', edit.oldUri, edit.newUri, Convert.uriToPath(edit.oldUri), Convert.uriToPath(edit.newUri))
      return fsPromises.rename(Convert.uriToPath(edit.oldUri), Convert.uriToPath(edit.newUri))
    } else if (edit.kind === 'create') {
      return fsPromises.writeFile(edit.uri, '')
    }
  }

  public static handleTextDocumentEdit (buffer: TextBuffer, edit: lsp.TextDocumentEdit): number
  {
    const atomEdits: atomIde.TextEdit[] = []

    edit.edits.forEach((textEdit: lsp.TextEdit) => {
      atomEdits.push(Convert.convertLsTextEdit(textEdit))
    })

    const checkpoint = buffer.createCheckpoint()

    try {
      // Sort edits in reverse order to prevent edit conflicts.
      atomEdits.sort((edit1, edit2) => -edit1.oldRange.compare(edit2.oldRange))
      atomEdits.reduce((previous: atomIde.TextEdit | null, current) => {
        WorkspaceEditHandler.validateEdit(buffer, current, previous)
        buffer.setTextInRange(current.oldRange, current.newText)
        return current
      }, null)
      buffer.groupChangesSinceCheckpoint(checkpoint)
      return checkpoint
    } catch (err) {
      buffer.revertToCheckpoint(checkpoint)
      throw err
    }
  }

  protected static isTextDocumentEdit(edit: (lsp.TextDocumentEdit | lsp.CreateFile | lsp.RenameFile | lsp.DeleteFile)): edit is lsp.TextDocumentEdit {
    return (<lsp.TextDocumentEdit>edit).edits !== undefined;
  }

  protected static async getBuffer(uri: string): Promise<TextBuffer>
  {
    const path = Convert.uriToPath(uri)
    const editor = (await atom.workspace.open(path, {
      searchAllPanes: true,
      // Open new editors in the background.
      activatePane: false,
      activateItem: false,
    })) as TextEditor

    return editor.getBuffer()
  }

  /** Private: Do some basic sanity checking on the edit ranges. */
  private static validateEdit(buffer: TextBuffer, edit: atomIde.TextEdit, prevEdit: atomIde.TextEdit | null): void {
    const path = buffer.getPath() || ""
    if (prevEdit && edit.oldRange.end.compare(prevEdit.oldRange.start) > 0) {
      throw Error(`Found overlapping edit ranges in ${path}`)
    }
    const startRow = edit.oldRange.start.row
    const startCol = edit.oldRange.start.column
    const lineLength = buffer.lineLengthForRow(startRow)
    if (lineLength == null || startCol > lineLength) {
      throw Error(`Out of range edit on ${path}:${startRow + 1}:${startCol + 1}`)
    }
  }
}
