module.exports = function stripConsolePlugin({ types: t }) {
  return {
    name: 'strip-console-plugin',
    visitor: {
      CallExpression(path) {
        const callee = path.get('callee');
        if (!callee.isMemberExpression()) return;
        if (callee.node.computed) return;
        if (!callee.get('object').isIdentifier({ name: 'console' })) return;
        if (!callee.get('property').isIdentifier()) return;

        if (path.parentPath.isExpressionStatement()) {
          path.parentPath.remove();
          return;
        }

        path.replaceWith(t.unaryExpression('void', t.numericLiteral(0)));
      },
    },
  };
};
