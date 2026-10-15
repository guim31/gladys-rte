# RTE éCO2mix & EcoWatt

Siga en Gladys el estado de la red eléctrica francesa, tal como RTE lo publica en datos abiertos:
cuánto CO₂ emite cada kilovatio hora producido en este momento, de dónde viene la electricidad
(nuclear, eólica, solar, presas, gas…) y la señal **EcoWatt**, el «tiempo de la electricidad» que
avisa cuando la red está tensa y conviene reducir el consumo.

Lo necesario para poner el lavavajillas, el termo eléctrico o la carga del coche cuando la
electricidad es más limpia, y para saber la víspera que llega un día naranja o rojo.

> **Desarrollada sin acceso a las API de RTE: sus comentarios son bienvenidos.** Esta integración
> se ha construido y probado con los formatos que documenta RTE (éCO2mix en ODRÉ, API EcoWatt v5),
> sin cuenta EcoWatt ni llamada real. Si algo no funciona como se describe, díganoslo en el
> [foro de Gladys](https://community.gladysassistant.com) o en las
> [issues](https://github.com/guim31/gladys-rte/issues).

Integración independiente, sin relación con RTE. Los datos siguen siendo de RTE.

## Presentación

La integración lee dos fuentes de RTE:

- **éCO2mix** (datos abiertos, sin cuenta ni clave): el mix de producción de la Francia
  continental cada cuarto de hora, el consumo nacional y la **intensidad de CO₂** en gramos por
  kilovatio hora.
- **EcoWatt** (clave gratuita que debe crear, opcional): la señal de hoy y de los tres días
  siguientes, hora por hora. Verde: sin tensión. Naranja: red tensa, ahorrar energía ayuda. Rojo:
  red muy tensa, puede haber cortes si el consumo no baja.

Añade dos dispositivos, un widget para el panel y un desencadenante de escena «Alerta EcoWatt
anunciada».

## Requisitos

- Gladys Assistant 5.1.0 o posterior.
- Acceso a internet desde Gladys (los datos vienen de los servidores de RTE).
- Solo para EcoWatt: una cuenta gratuita en [data.rte-france.com](https://data.rte-france.com) y
  una aplicación suscrita a la API **Ecowatt**:
  1. Cree su cuenta en data.rte-france.com e inicie sesión.
  2. En el catálogo de API, abra **Ecowatt** (versión 5) y luego **Suscribirse a la API**: el
     portal propone crear una aplicación; póngale un nombre (por ejemplo «Gladys»).
  3. En **Mis aplicaciones**, abra esa aplicación: muestra un **ID de cliente** y un **ID secreto**.
     Son los dos valores que debe copiar en Gladys.

Sin clave, la integración funciona solo con éCO2mix.

## Configuración

1. Instale la integración desde el catálogo de Gladys (o **Integraciones → Instalar desde GitHub**
   con la dirección de este repositorio).
2. En **Configuración**, pegue si lo desea el **ID de cliente EcoWatt** y el **Secreto de cliente
   EcoWatt**. El secreto se queda en Gladys y nunca aparece en los registros.
3. Elija el **Idioma de los nombres de funciones** (francés por defecto). Los nombres se asignan al
   añadir un dispositivo y ya no cambian después.
4. Guarde y abra la pestaña **Descubrimiento**: añada **Red eléctrica francesa** y, con una clave,
   **EcoWatt**.

### Botón «Probar la conexión con RTE»

Lee éCO2mix al instante y muestra la intensidad de CO₂ del último cuarto de hora publicado. Con una
clave, comprueba también que RTE la acepta e indica la señal EcoWatt del día. RTE solo permite una
llamada a las señales EcoWatt cada cuarto de hora: si la última es demasiado reciente, el botón
comprueba solo la clave e indica dentro de cuántos minutos se leerán de nuevo las señales.

## Los dispositivos

### Red eléctrica francesa

Actualizada cada cuarto de hora, al ritmo de los datos de RTE:

| Función                              | Lo que mide                                                               |
| ------------------------------------ | ------------------------------------------------------------------------- |
| Intensidad de CO₂                    | Gramos de CO₂ por kilovatio hora producido en Francia (g CO₂eq/kWh)       |
| Consumo nacional                     | El consumo de la Francia continental, en kW (Gladys no tiene GW)          |
| Proporción baja en carbono           | Nuclear y renovables, en % de la producción                               |
| Proporción renovable                 | Hidráulica, eólica, solar y bioenergía, en % de la producción             |
| Proporción nuclear, eólica…          | La proporción de cada fuente en la producción, en % entero                |
| Intercambios (import. + / export. −) | Lo que los países vecinos suministran (+) o reciben (−), en % del consumo |

En Francia, la intensidad de CO₂ suele estar entre 15 y 80 g/kWh; sube cuando funcionan las
centrales de gas o de carbón, normalmente las tardes de invierno. Gladys colorea la etiqueta: verde
por debajo de 150, naranja hasta 400, rojo por encima.

### EcoWatt

Con una clave, tres funciones dan la señal EcoWatt tal como RTE la numera:

| Función             | Valores                                              |
| ------------------- | ---------------------------------------------------- |
| EcoWatt hoy         | 1 verde, 2 naranja, 3 rojo                           |
| EcoWatt mañana      | 1 verde, 2 naranja, 3 rojo                           |
| EcoWatt hora actual | 0 producción sin carbono, 1 verde, 2 naranja, 3 rojo |

Gladys las muestra como un nivel de riesgo: 0 «Sin riesgo», 1 «Bajo», 2 «Medio», 3 «Alto». Un día
verde aparece por tanto como una etiqueta amarilla «Bajo»: es el color de Gladys para un riesgo
bajo, no una alerta. La hora actual cambia en cada hora en punto.

## Widget

El widget **Red eléctrica francesa** se coloca en el panel. Muestra:

- la intensidad de CO₂, el consumo nacional en GW y la proporción baja en carbono;
- con una clave, la señal EcoWatt de hoy y de mañana, en verde, naranja o rojo;
- la curva de CO₂ de 24 horas en barras, una vez añadido el dispositivo (Gladys guarda el
  historial);
- el mix de producción en barras, fuente por fuente, con las importaciones o exportaciones;
- la hora del cuarto de hora mostrado.

## Desencadenante de escena

**Alerta EcoWatt anunciada** (categoría **Integraciones** del editor de escenas): RTE anuncia un día
naranja o rojo, hoy o en los tres días siguientes. El desencadenante se activa **una vez por
anuncio**: cuando un día pasa a naranja, y de nuevo si pasa a rojo, nunca en cada lectura, ni
siquiera después de un reinicio.

Filtros (vacíos, todo coincide): la **Señal** (naranja, rojo) y el **Día afectado** (hoy, mañana,
dentro de dos o tres días).

Información transmitida a las acciones de la escena: la señal (`orange` o `red`), el nivel EcoWatt
(2 o 3), la fecha del día afectado, dentro de cuántos días, y el mensaje de RTE.

Para reaccionar a la intensidad de CO₂ no hace falta un desencadenante propio: el desencadenante
nativo de Gladys «Un dispositivo cambia de estado» ya compara la función **Intensidad de CO₂** con
un umbral.

## Ejemplos de escenas

- **CO₂ bajo → poner el lavavajillas o la carga.** Desencadenante: «Un dispositivo cambia de
  estado», **Intensidad de CO₂** inferior a 40 g/kWh. Condición: entre las 10:00 y las 16:00 (o en
  sus horas valle). Acción: encender el enchufe del lavavajillas preparado por la mañana, o el punto
  de recarga.
- **Mañana día rojo → avisar en casa.** Desencadenante: **Alerta EcoWatt anunciada**, señal roja,
  día afectado mañana. Acción: enviar un mensaje «Mañana día rojo EcoWatt: nada de horno ni lavadora
  de 8:00 a 13:00 y de 18:00 a 20:00».
- **Hora naranja o roja → aplazar la carga del coche.** Desencadenante: «Un dispositivo cambia de
  estado», **EcoWatt hora actual** mayor o igual que 2. Acción: apagar el enchufe de carga. Una
  segunda escena lo vuelve a encender cuando el valor baja de 2.

## Ritmo de lectura y cuotas

- **éCO2mix** se lee cada cuarto de hora, solo cuando el dispositivo está añadido o el widget se
  muestra: 96 llamadas al día como máximo, sin clave. RTE publica cada cuarto de hora con
  aproximadamente una hora de retraso: los datos mostrados suelen tener una hora.
- **EcoWatt** se lee cada 30 minutos. RTE solo permite **una llamada a las señales cada 15 minutos**
  por aplicación: la integración nunca llama más a menudo, lo recuerda tras un reinicio (en `/data`)
  y espera el tiempo que pida RTE cuando responde «demasiadas solicitudes».
- Solo se envían a Gladys los cambios, y cada valor se reenvía al menos cada 6 horas para seguir
  fechado.

El uso de los datos sigue las condiciones de RTE: la licencia abierta de ODRÉ para éCO2mix, las
condiciones de uso del portal data.rte-france.com para EcoWatt.

## Solución de problemas

- **«EcoWatt rechaza el ID de cliente y el secreto»** en la pantalla de configuración: copie de
  nuevo los dos valores desde **Mis aplicaciones** en data.rte-france.com, sin espacios, y compruebe
  que la aplicación está suscrita a la API **Ecowatt**.
- **«éCO2mix (RTE) no responde»**: el servicio de RTE no está disponible o Gladys no tiene acceso a
  internet. La integración vuelve a intentarlo sola cada cuarto de hora.
- **Ningún valor en la red eléctrica**: un valor de más de tres horas no se envía (mejor ningún
  valor que uno erróneo). Use el botón **Probar la conexión con RTE**.
- **Más detalles**: los registros de la integración (pestaña Supervisión) solo muestran los eventos
  útiles. Para verlo todo, defina la variable `LOG_LEVEL=debug`.

## Límites

- Solo la Francia continental (sin Córcega ni los territorios de ultramar), como éCO2mix.
- Las proporciones por fuente son porcentajes enteros; el widget muestra un decimal por debajo del
  10 %.
- El consumo aparece en kW en el dispositivo: Gladys no tiene unidad MW ni GW. El widget lo muestra
  en GW.
- El fueloil (menos del 1 % de la producción) no tiene función propia; aparece en el widget por
  encima del 0,5 %.
- El mensaje de RTE transmitido a las escenas está en francés, tal como lo publica RTE.
- EcoWatt no da previsión de CO₂: esta integración no incluye ninguna previsión de la intensidad de
  CO₂.
