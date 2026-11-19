# Avisos por WhatsApp desde Tuerkit

Cuando un taller cambia el estado de un auto en Tuerkit, al cliente le llega un WhatsApp **desde el número del taller**:

> Hola Juan, te escribimos de Taller Gotuerca. Tu Toyota Yaris patente ABCD12 cambió de estado: Listo para retirar.
>
> Puedes ver el detalle en este link: https://…
>
> Si tienes dudas, responde este mensaje.

El envío lo hace STPyme con la API oficial de WhatsApp (Meta). A Tuerkit solo le toca **llamar a un endpoint cada vez que cambia un estado**.

## 1. Preparar cada taller (lo hace STPyme)

1. El taller conecta su WhatsApp desde el link de invitación de STPyme ("Conectar WhatsApp"). Puede seguir usando su app WhatsApp Business.
2. En el panel de STPyme → **WhatsApp** → cuenta del taller → botón **Tuerkit**:
   - se mandan a Meta las dos plantillas del aviso (`estado_vehiculo` y `estado_vehiculo_link`); Meta las revisa, normalmente en minutos u horas;
   - con **Crear clave para Tuerkit** se genera la clave del taller (`tk_…`). Se muestra una sola vez.
3. La clave se guarda en Tuerkit, en la configuración de ese taller. Es secreta: va solo en el servidor de Tuerkit.

## 2. Llamar al endpoint cuando cambia el estado

```http
POST https://stpyme.cl/api/publico/tuerkit
Authorization: Bearer tk_…clave del taller…
Content-Type: application/json

{
  "telefono": "+56 9 1234 5678",
  "cliente": "Juan",
  "vehiculo": "Toyota Yaris",
  "patente": "ABCD12",
  "estado": "Listo para retirar",
  "link": "https://…/estado-del-auto",
  "idEvento": "orden-1532-estado-4"
}
```

| Campo | Obligatorio | Nota |
|---|---|---|
| `telefono` | sí | Celular del cliente. Un celular chileno puede venir como `9 1234 5678`; otros países, con su código. |
| `patente` | sí | Se manda en mayúsculas. |
| `estado` | sí | El nombre del estado tal como lo ve el cliente (máx. 60 letras). |
| `cliente` | no | Nombre del cliente. Si falta, dice "Hola cliente". |
| `vehiculo` | no | Marca y modelo. Si falta, dice "vehículo". |
| `link` | no | Link al portal del cliente (debe empezar con `https://`). Con link se usa la plantilla `estado_vehiculo_link`. |
| `idEvento` | recomendado | Un ID único del cambio de estado. Si Tuerkit reintenta con el mismo `idEvento`, el aviso no se manda dos veces. |
| `taller` | no | Nombre del taller en el mensaje. Si falta, se usa el nombre de su WhatsApp. |

### Respuestas

| Código | Significado |
|---|---|
| `200 {"ok":true,"id":"wamid…","plantilla":"estado_vehiculo"}` | Enviado. Con `"repetido":true` ya se había enviado antes con ese `idEvento`. |
| `400` | Falta un dato o viene mal (el mensaje dice cuál). |
| `401` | Clave inválida o reemplazada por una nueva. |
| `409` | El WhatsApp del taller no está conectado. |
| `429` | El taller pasó de 300 avisos en el día (protección contra bucles). |
| `502` | Meta no aceptó el envío; por ejemplo, la plantilla todavía no está aprobada. El mensaje trae el detalle. |

Recomendaciones:
- Llamar desde el **servidor** de Tuerkit, nunca desde el navegador (la clave quedaría expuesta).
- No bloquear el cambio de estado si el aviso falla: guardar el error y reintentar después con el mismo `idEvento`.
- Pedir al cliente, al ingresar el auto, su OK para recibir avisos por WhatsApp (una casilla basta).

### Revisar las plantillas

```http
POST https://stpyme.cl/api/publico/tuerkit
Authorization: Bearer tk_…
Content-Type: application/json

{ "accion": "plantillas" }
```

Responde `{"plantillas":[{"nombre":"estado_vehiculo","estado":"APPROVED"}, …]}`. Mientras no estén en `APPROVED`, los avisos fallan con `502`.

## Costo

Meta cobra cada aviso como mensaje de **utilidad**, a la cuenta de WhatsApp del taller. Los últimos avisos de cada taller se ven en el panel de STPyme, en el botón **Tuerkit**.
