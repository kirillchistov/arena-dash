# Протокол сообщений
На сервере и клиенте пока общие типы протокола (hello → join → state), потом вынесем в shared.

## Типы сообщений
**От клиента к серверу:**
```bash
join: игрок сообщает свой ник.

json
{ "type": "join", "nickname": "Player123" }
input: состояние ввода (пока только направление).

json
{ "type": "input", "input": { "dx": 1, "dy": 0 } }
```
**От сервера к клиенту:**
```bash
welcome: как раньше, просто приветствие.

joined: подтверждение входа, выдаёт playerId.

json
{ "type": "joined", "playerId": "abc123" }
state: периодически рассылаемый снэпшот игры.

json
{
  "type": "state",
  "players": [
    { "id": "abc123", "nickname": "Player123", "x": 100, "y": 150 },
    { "id": "xyz999", "nickname": "Other", "x": 200, "y": 300 }
  ]
}
```