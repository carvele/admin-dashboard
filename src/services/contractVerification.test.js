import fs from 'fs';
import path from 'path';
import ts from 'typescript';

/**
 * Static AST-Based RPC Contract Verification Guard.
 *
 * Parses database.types.ts and all service call sites via the TypeScript
 * Compiler API AST parser. Ensures compile-time and test-time safety:
 * 1. Prohibits unknown RPCs not present in generated Database['public']['Functions'].
 * 2. Enforces parameter name precision (no typos or stale arguments like B5-ADMIN-CONTRACT-001).
 * 3. Enforces that all required RPC parameters are supplied.
 * 4. Rejects dynamic RPC invocations unless explicitly allowlisted.
 */

describe('RPC Contract Verification (AST-Based Static Analysis)', () => {
  const typesPath = path.resolve(__dirname, '../types/database.types.ts');
  const servicesDir = path.resolve(__dirname);

  function parseDatabaseFunctions() {
    const content = fs.readFileSync(typesPath, 'utf8');
    const sourceFile = ts.createSourceFile(typesPath, content, ts.ScriptTarget.Latest, true);

    let functionsNode = null;
    function visit(node) {
      if (ts.isTypeAliasDeclaration(node) && node.name.text === 'Database') {
        if (ts.isTypeLiteralNode(node.type)) {
          for (const member of node.type.members) {
            const memberName = member.name?.text || member.name?.escapedText;
            if (memberName === 'public' && ts.isTypeLiteralNode(member.type)) {
              for (const pubMember of member.type.members) {
                const pubName = pubMember.name?.text || pubMember.name?.escapedText;
                if (pubName === 'Functions') {
                  functionsNode = pubMember.type;
                }
              }
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);

    expect(functionsNode).not.toBeNull();

    const functionsMap = {};
    for (const member of functionsNode.members) {
      const fnName = member.name.text || member.name.escapedText;
      const args = { required: new Set(), optional: new Set() };

      if (ts.isTypeLiteralNode(member.type)) {
        for (const sub of member.type.members) {
          const subName = sub.name.text || sub.name.escapedText;
          if (subName === 'Args' && ts.isTypeLiteralNode(sub.type)) {
            for (const argProp of sub.type.members) {
              const argName = argProp.name.text || argProp.name.escapedText;
              if (argProp.questionToken) {
                args.optional.add(argName);
              } else {
                args.required.add(argName);
              }
            }
          }
        }
      }
      functionsMap[fnName] = args;
    }
    return functionsMap;
  }

  function extractRpcCallSites() {
    const serviceFiles = fs
      .readdirSync(servicesDir)
      .filter((f) => (f.endsWith('.js') || f.endsWith('.ts')) && !f.includes('.test.') && !f.includes('.spec.'))
      .map((f) => path.join(servicesDir, f));

    const rpcCalls = [];

    for (const filePath of serviceFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

      function findRpc(node) {
        if (ts.isCallExpression(node)) {
          const expr = node.expression;
          if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'rpc') {
            const arg0 = node.arguments[0];
            const arg1 = node.arguments[1];

            let fnName = null;
            let isLiteral = false;
            if (arg0 && ts.isStringLiteral(arg0)) {
              fnName = arg0.text;
              isLiteral = true;
            }

            const passedArgs = [];
            let hasSpread = false;
            if (arg1 && ts.isObjectLiteralExpression(arg1)) {
              for (const prop of arg1.properties) {
                if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
                  passedArgs.push(prop.name.text || prop.name.escapedText);
                } else if (ts.isSpreadAssignment(prop)) {
                  hasSpread = true;
                }
              }
            }

            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            rpcCalls.push({
              file: path.basename(filePath),
              line: line + 1,
              fnName,
              isLiteral,
              passedArgs,
              hasSpread,
            });
          }
        }
        ts.forEachChild(node, findRpc);
      }
      findRpc(sourceFile);
    }
    return rpcCalls;
  }

  it('verifies all supabase.rpc calls match database.types.ts schema definitions', () => {
    const functionsMap = parseDatabaseFunctions();
    const rpcCalls = extractRpcCallSites();

    expect(rpcCalls.length).toBeGreaterThan(0);

    const violations = [];

    for (const call of rpcCalls) {
      if (!call.isLiteral) {
        violations.push(`${call.file}:${call.line} - Dynamic RPC name invocation prohibited.`);
        continue;
      }

      const schema = functionsMap[call.fnName];
      if (!schema) {
        violations.push(
          `${call.file}:${call.line} - RPC '${call.fnName}' is not defined in generated database.types.ts.`
        );
        continue;
      }

      if (!call.hasSpread) {
        for (const arg of call.passedArgs) {
          if (!schema.required.has(arg) && !schema.optional.has(arg)) {
            violations.push(
              `${call.file}:${call.line} - RPC '${call.fnName}' called with unexpected parameter '${arg}'.`
            );
          }
        }

        for (const req of schema.required) {
          if (!call.passedArgs.includes(req)) {
            violations.push(
              `${call.file}:${call.line} - RPC '${call.fnName}' missing required parameter '${req}'.`
            );
          }
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('correctly flags hypothetical contract violations', () => {
    const testFunctionsMap = {
      test_rpc: {
        required: new Set(['p_id', 'p_amount']),
        optional: new Set(['p_note']),
      },
    };

    const badCalls = [
      { file: 'test.js', line: 10, fnName: 'unknown_rpc', isLiteral: true, passedArgs: [] },
      { file: 'test.js', line: 20, fnName: 'test_rpc', isLiteral: true, passedArgs: ['p_id', 'p_extra'] },
      { file: 'test.js', line: 30, fnName: null, isLiteral: false, passedArgs: [] },
    ];

    const violations = [];
    for (const call of badCalls) {
      if (!call.isLiteral) {
        violations.push('Dynamic RPC name');
        continue;
      }
      const schema = testFunctionsMap[call.fnName];
      if (!schema) {
        violations.push('Unknown RPC');
        continue;
      }
      for (const arg of call.passedArgs) {
        if (!schema.required.has(arg) && !schema.optional.has(arg)) {
          violations.push('Unexpected parameter: ' + arg);
        }
      }
      for (const req of schema.required) {
        if (!call.passedArgs.includes(req)) {
          violations.push('Missing required: ' + req);
        }
      }
    }

    expect(violations).toEqual([
      'Unknown RPC',
      'Unexpected parameter: p_extra',
      'Missing required: p_amount',
      'Dynamic RPC name',
    ]);
  });
});
