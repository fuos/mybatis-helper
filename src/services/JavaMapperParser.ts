import * as path from 'path'
import { TextDocument } from 'vscode'
import { Token, Service } from 'typedi'
import { MethodDeclaration, Mapper, MapperType } from '../types/Codes'
import { IMapperParser, getMapperType } from './MapperParser'

export const IJavaMapperParserToken = new Token<IMapperParser>()

@Service(IJavaMapperParserToken)
class JavaMapperParser implements IMapperParser {
  isValid(doc: TextDocument): boolean {
    if (!doc) {
      return false
    }
    return true
  }

  parse(document: TextDocument): Mapper | undefined {
    const javaContent = document.getText()

    const matchedPacakgeName = javaContent.match(/package\s+([a-zA-Z_\.]+)?;/)
    if (!matchedPacakgeName || !matchedPacakgeName[1]) {
      return
    }
    const matchedClassName = javaContent.match(/(?:interface|class)\s+([\w|\d]*)?/)
    if (!matchedClassName || !matchedClassName[1]) {
      return
    }
    const namespace = `${matchedPacakgeName[1]}.${matchedClassName[1]}`
    const methods = findMethodDeclarations(document)
    const mapperType = getMapperType(document.uri.fsPath)

    if (!mapperType) {
      return
    }

    return {
      namespace,
      uri: document.uri,
      methods,
      type: mapperType
    }
  }
}

/**
 * 查找Java文件中的方法声明
 * 修复同名方法只显示第一个跳转的bug，使用正则表达式全局匹配来找到所有方法的正确位置
 * @param document TextDocument对象
 * @returns 方法声明数组
 */
function findMethodDeclarations(document: TextDocument): Array<MethodDeclaration> {
  const fileContent = document.getText()
  const matched = fileContent.match(/(?:interface|class).+.+{([\s\n\r\S]*)}/)  
  if (!matched) {
    return []
  }
  const classOrInterfaceContent = matched[1]
  if (!classOrInterfaceContent) {
    return []
  }

  // 使用正则表达式全局匹配所有方法
  const methodRegex = /\s+([a-zA-Z_0-9]+)(\s*)\((.*)\)/g
  const methods: Array<MethodDeclaration> = []
  let match
  
  // 计算类或接口内容在整个文件中的起始位置
  const classStartIndex = fileContent.indexOf(matched[1])
  
  // 使用exec循环来找到所有匹配项
  while ((match = methodRegex.exec(classOrInterfaceContent)) !== null) {
    const methodName = match[1]
    const fullMatch = match[0]
    
    // 找到方法名在匹配字符串中的位置
    const methodNameIndex = fullMatch.indexOf(methodName)
    
    // 计算方法名在整个文件中的绝对位置
    const absoluteStartOffset = classStartIndex + match.index + methodNameIndex
    
    methods.push({
      name: methodName,
      startPosition: document.positionAt(absoluteStartOffset),
      endPosition: document.positionAt(absoluteStartOffset + methodName.length)
    })
  }
  
  return methods
}
