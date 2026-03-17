exports.handler = async (event) => {
  const { code, state } = event.queryStringParameters;
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `<h1>Тест</h1><p>code: ${code}, state: ${state}</p>`
  };
};