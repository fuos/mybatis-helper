// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, ExtensionContext, workspace } from 'vscode'
import 'reflect-metadata'
import { Container } from 'typedi'
import { registerCodeLensProvider, registerDefinitionProvider } from './providers'
import { registerXmlMapperCmd } from './commands'
import { IMybatisMapperXMLServiceToken } from './services/MybatisMapperXMLService'
import { resolve } from 'url'
import { rejects } from 'assert'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "vscode-mybatisx" is now active!')

  const mybatisMapperXMLService = Container.get(IMybatisMapperXMLServiceToken)

  const hideFunc = window.setStatusBarMessage('mybatisx initializing....')

  Promise.all([mybatisMapperXMLService.initWatch()]).then(() => {
    context.subscriptions.push(registerXmlMapperCmd())
    context.subscriptions.push(registerCodeLensProvider())
    context.subscriptions.push(registerDefinitionProvider())
    context.subscriptions.push(mybatisMapperXMLService)
    context.subscriptions.push(
      workspace.onDidChangeWorkspaceFolders(e => {
        if (e.removed && e.removed.length > 0) {
          e.removed.map(r => {
            mybatisMapperXMLService.removeWorkspace(r.name)
          })
        }

        if (e.added && e.added.length > 0) {
          mybatisMapperXMLService.initWatch()
        }
      })
    )
    hideFunc.dispose()
  })
}

// this method is called when your extension is deactivated
export function deactivate() {}
