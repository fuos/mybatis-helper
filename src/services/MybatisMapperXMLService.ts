import * as glob from 'glob'
import { Uri, Disposable, workspace } from 'vscode'
import { basename } from 'path'
import { TextDocument } from 'vscode'
import { Service, Token, Inject } from 'typedi'
import { Mapper } from '../types/Codes'
import { IMapperParser } from '../services/MapperParser'
import { IXmlMapperParserToken } from '../services/XmlMapperParser'
import { resolve } from 'dns'

export interface IMybatisMapperXMLService {
  findXmlMapperByJavaMapper(jMapper: Mapper): Mapper | undefined
  findXmlMapperByUri(uri: Uri): Mapper | undefined
  initWatch(): void
  dispose(): void
  removeWorkspace(baseName: string): void
  isMapperClass(document: TextDocument, baseName: string): boolean
}

export const IMybatisMapperXMLServiceToken = new Token<IMybatisMapperXMLService>()

export class WorkspaceMapper {
  baseName: string
  mapperXmls: Array<Mapper>
  namespaces: Array<String>

  constructor(baseName: string) {
    this.baseName = baseName
    this.mapperXmls = []
    this.namespaces = []
  }

  pushMapper(mapper: Mapper): void {
    const found = this.mapperXmls.find(m => m.uri.fsPath === mapper.uri.path)
    if (!found) {
      this.mapperXmls.push(mapper)
      this.namespaces.push(mapper.namespace)
    } else {
      this.mapperXmls = this.mapperXmls.map(m => {
        if (m.uri.fsPath === mapper.uri.fsPath) {
          return mapper
        }
        return m
      })
    }
  }

  containNamespace(namespace: string) {
    const found = this.namespaces.find(n => n === namespace)
    if (found) {
      return true
    }
    return false
  }

  removeMapper(uri: Uri): void {
    this.mapperXmls = this.mapperXmls.filter(m => {
      if (m.uri.fsPath !== uri.fsPath) {
        return m
      } else {
        var namespace = m.namespace
        this.namespaces = this.namespaces.filter(n => n !== namespace)
        return
      }
    })
  }
}

@Service(IMybatisMapperXMLServiceToken)
class MybatisMapperXMLService implements Disposable {
  private disposables: Array<Disposable> = []

  private workspaceMappers: Array<WorkspaceMapper> = []

  private xmlMapperService: IMapperParser

  constructor(@Inject(IXmlMapperParserToken) xmlMapperService: IMapperParser) {
    this.xmlMapperService = xmlMapperService
  }

  public isMapperClass(document: TextDocument, baseName: string): boolean {
    const javaContent = document.getText()

    const matchedPacakgeName = javaContent.match(/package\s+([a-zA-Z_\.]+)?;/)
    if (!matchedPacakgeName || !matchedPacakgeName[1]) {
      return false
    }
    const matchedClassName = javaContent.match(/(?:interface|class)\s+([\w|\d]*)?/)
    if (!matchedClassName || !matchedClassName[1]) {
      return false
    }

    const className = `${matchedPacakgeName[1]}.${matchedClassName[1]}`
    const mappers = this.workspaceMappers.find(w => w.baseName === baseName)
    if (!mappers) {
      return false
    }
    return mappers.containNamespace(className)
  }

  public findXmlMapperByJavaMapper(jMapper: Mapper) {
    const workspaceMapper = this.findMapper(jMapper.uri)
    if (!workspaceMapper) {
      return undefined
    } else {
      return workspaceMapper.mapperXmls.find(
        mapper => mapper.type === jMapper.type && mapper.namespace === jMapper.namespace
      )
    }
  }

  public findXmlMapperByUri(uri: Uri) {
    const workspaceMapper = this.findMapper(uri)
    if (!workspaceMapper) {
      return undefined
    } else {
      return workspaceMapper.mapperXmls.find(mapper => mapper.uri.fsPath === uri.fsPath)
    }
  }

  private findMapper(uri: Uri): WorkspaceMapper | undefined {
    var folder = workspace.getWorkspaceFolder(uri)
    if (!folder) {
      return undefined
    }
    const baseName = basename(folder.uri.fsPath)
    const wms = this.workspaceMappers.filter(m => m.baseName === baseName)
    if (!wms || wms.length === 0) {
      return undefined
    } else {
      return wms[0]
    }
  }

  public initWatch(): void {
    const { workspaceFolders } = workspace
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return
    }

    workspaceFolders.map(f => {
      const wfound = this.workspaceMappers.find(wm => wm.baseName === f.name)
      if (!wfound) {
        var wsMapper = new WorkspaceMapper(f.name)
        this.workspaceMappers.push(wsMapper)
        const workspaceFolderPath = f.uri.fsPath
        const pattern = workspaceFolderPath + '/**/*.xml'
        const watcher = workspace.createFileSystemWatcher(pattern, false, false, false)

        this.disposables.push(
          watcher.onDidCreate(async e => {
            await this.save(e)
          })
        )

        this.disposables.push(
          watcher.onDidChange(async e => {
            await this.save(e)
          })
        )
        this.disposables.push(
          watcher.onDidDelete(async e => {
            const baseName = basename(e.fsPath)
            this.workspaceMappers.map(w => {
              if (w.baseName === baseName) {
                w.removeMapper(e)
              }
            })
          })
        )

        this.disposables.push(watcher)

        const mapperPattern = workspaceFolderPath + '/**/src/**/*.xml'

        new Promise((resolve, reject) => {
          glob(mapperPattern, (err, data) => {
            if (err) {
              return reject(err)
            }

            data.map(d => Uri.file(d)).map(d => this.save(d))
            resolve()
          })
        }).then(() => resolve)
      }
    })
  }

  private async save(uri: Uri) {
    const workspaceMapper = this.findMapper(uri)
    if (!workspaceMapper) {
      return
    }
    workspace.openTextDocument(uri).then(doc => {
      try {
        if (!this.xmlMapperService.isValid(doc)) {
          return workspaceMapper.removeMapper(uri)
        }

        const mapper = this.xmlMapperService.parse(doc)
        if (!mapper) {
          return workspaceMapper.removeMapper(uri)
        }

        workspaceMapper.pushMapper(mapper)
      } catch (error) {
        workspaceMapper.removeMapper(uri)
      }
    })
  }

  public removeWorkspace(baseName: string): void {
    this.workspaceMappers = this.workspaceMappers.filter(w => w.baseName !== baseName)
  }

  dispose() {
    this.disposables.forEach(d => {
      d.dispose()
    })
  }
}
