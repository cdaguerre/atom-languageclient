import type * as atomIde from "atom-ide-base"
import Convert from "../convert"
import { Point, TextEditor } from "atom"
import {
  LanguageClientConnection,
  RenameParams,
  PrepareRenameParams,  
  ServerCapabilities,
  WorkspaceEdit,
  Range
} from "../languageclient"

export default class RenameAdapter {
  public static canAdapt(serverCapabilities: ServerCapabilities): boolean {
    return serverCapabilities.renameProvider !== false
  }

  public static async getRename(
    connection: LanguageClientConnection,
    editor: TextEditor,
    point: Point,
    newName: string
  ): Promise<Map<atomIde.IdeUri, atomIde.TextEdit[]> | null> {
    const edit = await connection.rename(RenameAdapter.createRenameParams(editor, point, newName))
    if (edit === null) {
      return null
    }

    if (edit.documentChanges) {
      return RenameAdapter.convertDocumentChanges(<TextDocumentEdit[]>edit.documentChanges)
    } else if (edit.changes) {
      return RenameAdapter.convertChanges(edit.changes)
    } else {
      return null
    }
  }
  
  public static async rename(
    connection: LanguageClientConnection,
    editor: TextEditor,
    point: Point,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    return await connection.rename(RenameAdapter.createRenameParams(editor, point, newName))
  }  

  public static async prepareRename(
    connection: LanguageClientConnection,
    editor: TextEditor,
    point: Point,    
  ): Promise<Range | { range: Range, placeholder: string } | { defaultBehavior: boolean } | null> {
    return await connection.prepareRename(RenameAdapter.createPrepareRenameParams(editor, point))
  } 

  public static createRenameParams(editor: TextEditor, point: Point, newName: string): RenameParams {
    return {
      textDocument: Convert.editorToTextDocumentIdentifier(editor),
      position: Convert.pointToPosition(point),
      newName,
    }
  }
  
  public static createPrepareRenameParams(editor: TextEditor, point: Point): PrepareRenameParams {
    return {
      textDocument: Convert.editorToTextDocumentIdentifier(editor),
      position: Convert.pointToPosition(point),
    }
  }  
  
  private static convertDocumentChanges(workspaceEdit: WorkspaceEdit): Map<atomIde.IdeUri, atomIde.TextEdit[]> {
    const result = new Map()
    workspaceEdit.documentChanges?.forEach((documentEdit) => {
      result.set(Convert.uriToPath(documentEdit.textDocument.uri), Convert.convertLsTextEdits(documentEdit.edits))
    })
    return result
  }  
}
