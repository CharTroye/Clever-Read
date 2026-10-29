# Motion reference and application

Reference: https://www.bilibili.com/video/BV13X4y1W7h4/

The public video stream was inspected through consecutive frame samples from three intervals. The observations below describe visible transitions. The durations and easing in this proposal are newly selected for a reading interface; they are not claimed to be the source video's original parameters.

| Reference interval | Observation | Application |
| --- | --- | --- |
| 02:19–02:34 | A stacked payment card becomes the selected card; adjacent cards slide into the same position. | A document cover deck changes the selected document, then expands the selected cover or row into the reading page. |
| 03:52–04:02 | Starting an exercise reorganizes the existing control regions into the active timer and its actions. | Submitting a question transfers its text from the composer to the conversation, with the send control becoming a stop control. |
| 04:43–04:58 | A recording changes from an active card to a naming panel and then a saved item in the list. | Settings enter and exit along a consistent path; the selected style frame moves between options while preserving the panel. |

Implementation timing: cover selection 280 ms; shared-element transfer 280 ms; question transfer 260 ms; selection frame 240 ms; settings entry 260 ms and exit 160 ms. The interface uses a strong ease-out curve, `cubic-bezier(.23,1,.32,1)`.

Transitions use DOM geometry and compositor transforms so the preview remains usable when its surrounding frame changes size. Transient visual copies are inert, hidden from assistive technology, and removed after the transition. Keyboard actions and reduced-motion preferences use immediate state changes.

The content of the reading page stays still during ordinary reading. There are no looping decorative animations, scroll hijacks, or added margin-annotation features.
