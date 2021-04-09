import Convert from "../convert"
import { Point, TextEditor } from "atom"
import {
  LanguageClientConnection,
  RenameParams,
  ServerCapabilities,
  WorkspaceEdit
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
  ): Promise<WorkspaceEdit | null> {
    return await connection.rename(RenameAdapter.createRenameParams(editor, point, newName))
  }

  public static createRenameParams(editor: TextEditor, point: Point, newName: string): RenameParams {
    return {
      textDocument: Convert.editorToTextDocumentIdentifier(editor),
      position: Convert.pointToPosition(point),
      newName,
    }
  }
}
