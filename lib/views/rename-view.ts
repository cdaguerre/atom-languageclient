import { LanguageClientConnection } from "../languageclient"
import { TextEditor, Panel, TextEditorElement } from "atom"
import RenameAdapter from "../adapters/rename-adapter"
import WorkspaceEditHandler from "../handlers/workspace-edit"

export default class RenameView {
  public element: HTMLElement

  private _connection: LanguageClientConnection
  private _miniEditor: TextEditor
  private _panel: Panel

  private _previouslyFocusedElement: Element|null = null

  constructor (_connection: LanguageClientConnection) {
    this._connection = _connection

    this._miniEditor = new TextEditor({ mini: true })
    const editorElement = this.getEditorElement()
    editorElement.addEventListener('blur', this.close.bind(this))

    const message = document.createElement('div')
    message.classList.add('message')
    message.textContent = 'Enter new name'

    this.element = document.createElement('div')
    this.element.classList.add('rename')
    this.element.appendChild(editorElement)
    this.element.appendChild(message)

    this._panel = atom.workspace.addModalPanel({
      item: this,
      visible: false
    })

    atom.commands.add('atom-text-editor', 'IDE:rename', () => {
      this.toggle()
    })
    atom.commands.add(editorElement, 'core:confirm', () => {
      this.rename()
      this.close()
    })
    atom.commands.add(editorElement, 'core:cancel', () => {
      this.close()
    })
    atom.contextMenu.add({
      'atom-text-editor': [
        { type: 'separator' },
        { label: 'Refactor', submenu: [
          { label: 'Rename', command: 'IDE:rename' }
        ]}
      ]
    })
  }

  toggle () {
    this._panel.isVisible() ? this.close() : this.open()
  }

  close () {
    if (!this._panel.isVisible()) return
    this._miniEditor.setText('')
    this._panel.hide()

    if (this.getEditorElement().hasFocus()) {
      this.restoreFocus()
    }
  }

  rename () {
    const newName = this._miniEditor.getText()
    const editor = atom.workspace.getActiveTextEditor()

    if (!editor || !newName.length) return

    const position = editor.getCursorBufferPosition()

    RenameAdapter.getRename(this._connection, editor, position, newName)
    .then(function (edit) {
      if (edit) {
        WorkspaceEditHandler.handle(edit)
      }
    })
  }

  storeFocusedElement () {
    this._previouslyFocusedElement = document.activeElement
    return this._previouslyFocusedElement
  }

  restoreFocus () {
    if (
      this._previouslyFocusedElement &&
      this._previouslyFocusedElement.parentElement
    ) {
      return (this._previouslyFocusedElement as HTMLElement)?.focus()
    }
    atom.views.getView(atom.workspace).focus()
  }

  open () {
    if (this._panel.isVisible() || !atom.workspace.getActiveTextEditor()) return
    this.storeFocusedElement()
    this._panel.show()
    this.getEditorElement().focus()
  }

  private getEditorElement (): TextEditorElement{
    return atom.views.getView(this._miniEditor)
  }
}
