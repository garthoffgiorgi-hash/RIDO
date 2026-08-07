/* @ds-bundle: {"format":3,"namespace":"RIDODesignSystem_96eb19","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Input","sourcePath":"components/core/Input.jsx"},{"name":"FareChip","sourcePath":"components/rideshare/FareChip.jsx"},{"name":"StatusToggle","sourcePath":"components/rideshare/StatusToggle.jsx"},{"name":"TierProgress","sourcePath":"components/rideshare/TierProgress.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"1633381876f6","components/core/Badge.jsx":"bf9d61fe7734","components/core/Button.jsx":"e5ed7bfc4eb3","components/core/Card.jsx":"3a78554f8651","components/core/Input.jsx":"5b9016c04c59","components/rideshare/FareChip.jsx":"66d90531a8c2","components/rideshare/StatusToggle.jsx":"694eac89a907","components/rideshare/TierProgress.jsx":"cdfe5927107b","ui_kits/driver-app/DriverApp.jsx":"bfdd02fbac75","ui_kits/marketing/Landing.jsx":"7ba8046c057a","ui_kits/rider-app/PhoneFrame.jsx":"0b34eff76a90","ui_kits/rider-app/RiderApp.jsx":"ac91cf8b7f70"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.RIDODesignSystem_96eb19 = window.RIDODesignSystem_96eb19 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RIDO Avatar — initials circle, Signal tint background, Midnight text.
 * Falls back to initials when no image is supplied.
 */
function Avatar({
  name = '',
  src,
  size = 42,
  style,
  ...rest
}) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      flexShrink: 0,
      background: src ? 'var(--mist)' : 'var(--signal-12)',
      color: 'var(--midnight)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: Math.round(size * 0.34),
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover'
    }
  }) : initials || '·');
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RIDO Badge — a small status/label token. Muted semantic tones for status (success/danger),
 * brand tones for neutral/accent labels. Tabular numerals when it carries a number.
 */
function Badge({
  tone = 'neutral',
  children,
  style,
  ...rest
}) {
  const tones = {
    neutral: {
      background: 'var(--midnight-08)',
      color: 'var(--midnight)'
    },
    accent: {
      background: 'var(--signal-14)',
      color: 'var(--signal)'
    },
    success: {
      background: 'var(--success-12)',
      color: 'var(--success)'
    },
    danger: {
      background: 'var(--danger-12)',
      color: 'var(--danger)'
    }
  };
  const t = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '5px 10px',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      fontWeight: 600,
      lineHeight: 1,
      fontFeatureSettings: '"tnum" 1',
      ...t,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RIDO Button — sentence-case, plain-verb actions.
 * Primary = Midnight (default action). Accent = Signal (in-the-moment / live).
 * Secondary = white + Mist border. Ghost = transparent.
 */
function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  type = 'button',
  style,
  children,
  ...rest
}) {
  const sizes = {
    sm: {
      height: 40,
      padding: '0 16px',
      fontSize: 13
    },
    md: {
      height: 52,
      padding: '0 22px',
      fontSize: 15
    },
    lg: {
      height: 56,
      padding: '0 28px',
      fontSize: 16
    }
  };
  const variants = {
    primary: {
      background: 'var(--midnight)',
      color: 'var(--white)',
      border: '1px solid transparent'
    },
    accent: {
      background: 'var(--signal)',
      color: 'var(--white)',
      border: '1px solid transparent'
    },
    secondary: {
      background: 'var(--white)',
      color: 'var(--ink)',
      border: '1px solid var(--mist)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--slate)',
      border: '1px solid transparent'
    }
  };
  const s = sizes[size] || sizes.md;
  const v = variants[variant] || variants.primary;
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    disabled: disabled,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: s.height,
      padding: s.padding,
      width: fullWidth ? '100%' : 'auto',
      fontFamily: 'var(--font-ui)',
      fontSize: s.fontSize,
      fontWeight: 700,
      lineHeight: 1,
      letterSpacing: '0.005em',
      borderRadius: 'var(--radius-button)',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      transition: 'transform var(--dur-fast) var(--ease-standard), filter var(--dur-fast) var(--ease-standard)',
      WebkitTapHighlightColor: 'transparent',
      ...v,
      ...style
    },
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(0.98)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RIDO Card — the signature surface. White fill on the ivory canvas, 1px Mist border,
 * generous rounded corners. The default container for a ride, a driver, a fare.
 */
function Card({
  padding = 20,
  radius = 18,
  interactive = false,
  as: Tag = 'div',
  style,
  children,
  ...rest
}) {
  return /*#__PURE__*/React.createElement(Tag, _extends({
    style: {
      background: 'var(--white)',
      border: '1px solid var(--mist)',
      borderRadius: radius,
      padding,
      transition: interactive ? 'border-color var(--dur-base) var(--ease-standard), transform var(--dur-base) var(--ease-standard)' : undefined,
      cursor: interactive ? 'pointer' : undefined,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  useState
} = React;
/**
 * RIDO Input — white fill, Mist border, 52px tall, Signal focus ring.
 * Labels in Slate, sentence case. Optional leading element (e.g. a location dot).
 */
function Input({
  label,
  leading,
  error,
  style,
  wrapStyle,
  id,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  const inputId = id || (label ? `in-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      ...wrapStyle
    }
  }, label && /*#__PURE__*/React.createElement("label", {
    htmlFor: inputId,
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--slate)'
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      height: 52,
      padding: '0 14px',
      background: 'var(--white)',
      border: `1px solid ${error ? 'var(--danger)' : focused ? 'var(--signal)' : 'var(--mist)'}`,
      borderRadius: 'var(--radius-input)',
      boxShadow: focused ? '0 0 0 3px var(--signal-22)' : 'none',
      transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)'
    }
  }, leading, /*#__PURE__*/React.createElement("input", _extends({
    id: inputId,
    onFocus: e => {
      setFocused(true);
      rest.onFocus && rest.onFocus(e);
    },
    onBlur: e => {
      setFocused(false);
      rest.onBlur && rest.onBlur(e);
    },
    style: {
      flex: 1,
      border: 'none',
      outline: 'none',
      background: 'transparent',
      fontFamily: 'var(--font-ui)',
      fontSize: 15,
      color: 'var(--ink)',
      ...style
    }
  }, rest))), error && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      color: 'var(--danger)'
    }
  }, error));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Input.jsx", error: String((e && e.message) || e) }); }

// components/rideshare/FareChip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RIDO FareChip — the signature pill for ETAs, distances, fares, and live states.
 * Signal text on a low-alpha Signal tint, Sora tabular numerals. ("4 min away", "2.1 mi")
 */
function FareChip({
  tone = 'accent',
  children,
  style,
  ...rest
}) {
  const tones = {
    accent: {
      background: 'var(--signal-08)',
      color: 'var(--signal)'
    },
    midnight: {
      background: 'var(--midnight-08)',
      color: 'var(--midnight)'
    }
  };
  const t = tones[tone] || tones.accent;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '6px 11px',
      borderRadius: 'var(--radius-pill)',
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 13,
      lineHeight: 1,
      fontFeatureSettings: '"tnum" 1',
      ...t,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { FareChip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/rideshare/FareChip.jsx", error: String((e && e.message) || e) }); }

// components/rideshare/StatusToggle.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * RIDO StatusToggle — the driver online/offline switch.
 * Online = Signal track; Offline = Mist track. Label in Midnight.
 */
function StatusToggle({
  online = false,
  onChange,
  onLabel = 'Online',
  offLabel = 'Offline',
  showLabel = true,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    role: "switch",
    "aria-checked": online,
    onClick: () => onChange && onChange(!online),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 46,
      height: 27,
      borderRadius: 'var(--radius-pill)',
      background: online ? 'var(--signal)' : 'var(--mist)',
      transition: 'background var(--dur-base) var(--ease-standard)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 3,
      left: online ? 22 : 3,
      width: 21,
      height: 21,
      borderRadius: '50%',
      background: 'var(--white)',
      boxShadow: '0 1px 2px rgba(11,42,91,0.2)',
      transition: 'left var(--dur-base) var(--ease-standard)'
    }
  })), showLabel && /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--midnight)'
    }
  }, online ? onLabel : offLabel));
}
Object.assign(__ds_scope, { StatusToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/rideshare/StatusToggle.jsx", error: String((e && e.message) || e) }); }

// components/rideshare/TierProgress.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const DEFAULT_TIERS = [{
  from: 0,
  to: 1000,
  rateBps: 2000
},
// 20%
{
  from: 1000,
  to: 3000,
  rateBps: 1200
},
// 12%
{
  from: 3000,
  to: null,
  rateBps: 800
} // 8%
];
const money = cents => '$' + (cents / 100).toLocaleString('en-US', {
  minimumFractionDigits: cents % 100 ? 2 : 0,
  maximumFractionDigits: 2
});

/**
 * RIDO TierProgress — month-to-date earnings across the three graduated commission bands.
 * Turns the commission model into a visible motivator: the marginal rate falls as volume rises.
 * Amounts are integer cents (a money app never uses floats).
 */
function TierProgress({
  earnedCents = 0,
  displayMaxCents = 400000,
  // $4,000 visual ceiling
  tiers = DEFAULT_TIERS,
  showLegend = true,
  style,
  ...rest
}) {
  const max = displayMaxCents;
  const pct = c => `${Math.max(0, Math.min(100, c / max * 100))}%`;

  // which band is the driver currently earning in (the marginal rate)
  const activeIdx = tiers.findIndex(t => earnedCents < (t.to ?? Infinity));
  const currentBps = (tiers[activeIdx] ?? tiers[tiers.length - 1]).rateBps;
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      fontFamily: 'var(--font-ui)',
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 500,
      color: 'var(--slate)'
    }
  }, "This month"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 24,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, money(earnedCents), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--signal)',
      marginLeft: 7,
      fontWeight: 600
    }
  }, currentBps / 100, "% rate"))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 12,
      borderRadius: 'var(--radius-pill)',
      background: 'var(--ivory)',
      border: '1px solid var(--mist)',
      overflow: 'hidden'
    }
  }, tiers.slice(0, -1).map(t => /*#__PURE__*/React.createElement("span", {
    key: t.to,
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: pct(t.to),
      width: 1,
      background: 'var(--mist)',
      zIndex: 2
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: pct(earnedCents),
      background: 'var(--signal)',
      borderRadius: 'var(--radius-pill)',
      transition: 'width var(--dur-base) var(--ease-standard)'
    }
  })), showLegend && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      marginTop: 10
    }
  }, tiers.map((t, i) => {
    const isActive = i === activeIdx;
    const width = t.to == null ? max - t.from : t.to - t.from;
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      style: {
        flex: `${width} 0 0`,
        minWidth: 0,
        paddingRight: 8
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: 14,
        color: isActive ? 'var(--signal)' : 'var(--midnight)',
        fontFeatureSettings: '"tnum" 1'
      }
    }, t.rateBps / 100, "%"), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 11,
        color: 'var(--slate)',
        fontFeatureSettings: '"tnum" 1',
        marginTop: 2
      }
    }, money(t.from), t.to == null ? '+' : `–${money(t.to)}`));
  })));
}
Object.assign(__ds_scope, { TierProgress });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/rideshare/TierProgress.jsx", error: String((e && e.message) || e) }); }

// ui_kits/driver-app/DriverApp.jsx
try { (() => {
/* RIDO — Driver app. Online toggle → incoming ride (you keep $X / Y%) → en route → MTD tier earnings.
 * Composes DS primitives (Button, Card, Avatar, FareChip, Badge, StatusToggle, TierProgress). */
const {
  Button,
  Card,
  Avatar,
  FareChip,
  Badge,
  StatusToggle,
  TierProgress
} = window.RIDODesignSystem_96eb19;
const money = c => '$' + (c / 100).toLocaleString('en-US', {
  minimumFractionDigits: 2
});
const RECENT_RIDES = [{
  name: 'Geisel Library',
  time: 'Today 1:12am',
  keep: 730,
  pct: 87
}, {
  name: 'Pacific Beach',
  time: 'Today 12:40am',
  keep: 1485,
  pct: 87
}, {
  name: 'Gaslamp Quarter',
  time: 'Today 12:05am',
  keep: 2210,
  pct: 88
}];
function HeaderBar({
  online,
  setOnline,
  earnedToday
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 18px 14px',
      borderBottom: '1px solid var(--mist)',
      background: 'var(--white)'
    }
  }, /*#__PURE__*/React.createElement(StatusToggle, {
    online: online,
    onChange: setOnline
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
      color: 'var(--slate)',
      fontWeight: 600,
      letterSpacing: '.04em',
      textTransform: 'uppercase'
    }
  }, "Today"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, money(earnedToday))));
}
function EarningsPanel({
  mtdCents
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 18,
      overflowY: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      color: 'var(--slate)',
      marginBottom: 14
    }
  }, "Month-to-date earnings"), /*#__PURE__*/React.createElement(TierProgress, {
    earnedCents: mtdCents
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginTop: 16,
      paddingTop: 14,
      borderTop: '1px solid var(--mist)'
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "trending-up",
    size: 16,
    style: {
      color: 'var(--signal)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--midnight)'
    }
  }, money(300000 - mtdCents)), " more in fares to reach the ", /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--midnight)'
    }
  }, "8%"), " band."))), /*#__PURE__*/React.createElement(Card, null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 11,
      letterSpacing: '.04em',
      textTransform: 'uppercase',
      color: 'var(--slate)'
    }
  }, "Recent rides"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      color: 'var(--slate)'
    }
  }, "3 tonight")), RECENT_RIDES.map((r, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 0',
      borderBottom: i < RECENT_RIDES.length - 1 ? '1px solid var(--mist)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--ink)'
    }
  }, r.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      color: 'var(--slate)',
      marginTop: 1
    }
  }, r.time)), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 16,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, money(r.keep)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontSize: 11,
      color: 'var(--signal)',
      fontWeight: 600,
      fontFeatureSettings: '"tnum" 1'
    }
  }, "kept ", r.pct, "%"))))));
}
function KeepBlock({
  keepCents,
  pct
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '8px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      fontWeight: 600,
      color: 'var(--slate)',
      letterSpacing: '.04em',
      textTransform: 'uppercase'
    }
  }, "You keep"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 46,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1',
      lineHeight: 1.05,
      letterSpacing: '-.02em'
    }
  }, money(keepCents)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement(FareChip, null, pct, "% of the fare")));
}
function DriverApp() {
  const [online, setOnline] = React.useState(false);
  const [incoming, setIncoming] = React.useState(false);
  const [stage, setStage] = React.useState('idle'); // idle | enroute
  const [mtd, setMtd] = React.useState(184000);
  const [earnedToday, setEarnedToday] = React.useState(4425);

  // When the driver goes online, surface a request shortly after.
  React.useEffect(() => {
    if (online && stage === 'idle' && !incoming) {
      const t = setTimeout(() => setIncoming(true), 1500);
      return () => clearTimeout(t);
    }
  }, [online, stage, incoming]);
  const accept = () => {
    setIncoming(false);
    setStage('enroute');
  };
  const decline = () => setIncoming(false);
  const complete = () => {
    setStage('idle');
    setMtd(m => m + 840);
    setEarnedToday(e => e + 730);
  };
  return /*#__PURE__*/React.createElement(window.PhoneFrame, null, /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--white)'
    }
  }, /*#__PURE__*/React.createElement(window.StatusBar, null), /*#__PURE__*/React.createElement(HeaderBar, {
    online: online,
    setOnline: v => {
      setOnline(v);
      if (!v) {
        setIncoming(false);
        setStage('idle');
      }
    },
    earnedToday: earnedToday
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement(window.MapCanvas, {
    style: {
      filter: online ? 'none' : 'grayscale(.4) brightness(.99)'
    }
  }, online && stage === 'idle' && /*#__PURE__*/React.createElement(window.DriverDot, {
    top: "50%",
    left: "50%"
  }), stage === 'enroute' && /*#__PURE__*/React.createElement(window.MapPin, {
    top: "40%",
    left: "50%",
    kind: "pickup"
  })), !incoming && stage === 'idle' && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--white)',
      border: '1px solid var(--mist)',
      borderRadius: 999,
      padding: '9px 16px',
      boxShadow: '0 4px 14px rgba(11,42,91,.08)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: online ? 'var(--signal)' : 'var(--slate)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--midnight)'
    }
  }, online ? 'Online · waiting for rides' : 'You\u2019re offline')), !incoming && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      top: stage === 'enroute' ? 'auto' : '38%',
      background: 'var(--ivory)',
      borderRadius: '20px 20px 0 0',
      boxShadow: '0 -10px 34px rgba(11,42,91,.10)',
      overflow: 'hidden'
    }
  }, stage === 'enroute' ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 18,
      background: 'var(--white)',
      borderRadius: '20px 20px 0 0'
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, "Head to pickup"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      margin: '14px 0'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Maya R.",
    size: 46
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 15,
      color: 'var(--ink)'
    }
  }, "Maya R."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)'
    }
  }, "Revelle College \xB7 4 min away")), /*#__PURE__*/React.createElement(FareChip, null, "1.2 mi")), /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    fullWidth: true,
    onClick: complete
  }, "Complete pickup")) : /*#__PURE__*/React.createElement(EarningsPanel, {
    mtdCents: mtd
  })), incoming && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      background: 'var(--white)',
      borderRadius: '20px 20px 0 0',
      boxShadow: '0 -12px 40px rgba(11,42,91,.18)',
      padding: '18px 18px 26px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, "New ride request"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 14,
      color: 'var(--signal)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "timer",
    size: 15
  }), "0:12")), /*#__PURE__*/React.createElement(KeepBlock, {
    keepCents: 730,
    pct: 87
  }), /*#__PURE__*/React.createElement(Card, {
    padding: 14,
    radius: 14,
    style: {
      margin: '14px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Maya R.",
    size: 42
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--ink)'
    }
  }, "Maya R."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 12.5,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "star",
    size: 12,
    style: {
      color: 'var(--signal)'
    }
  }), "4.91")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
      color: 'var(--slate)'
    }
  }, "Pickup"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--ink)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, "4 min")), /*#__PURE__*/React.createElement("span", {
    style: {
      textAlign: 'right'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
      color: 'var(--slate)'
    }
  }, "Trip"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--ink)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, "2.1 mi")))), /*#__PURE__*/React.createElement(window.RouteMini, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: '0 0 38%'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    fullWidth: true,
    onClick: decline
  }, "Decline")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    onClick: accept
  }, "Accept"))))));
}
function RouteMini() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: '50%',
      border: '2px solid var(--midnight)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 2,
      flex: 1,
      minHeight: 18,
      background: 'var(--mist)',
      margin: '2px 0'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 2,
      background: 'var(--midnight)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      fontFamily: 'var(--font-ui)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--ink)'
    }
  }, "Revelle College"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--slate)',
      marginBottom: 9
    }
  }, "Pickup"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--ink)'
    }
  }, "Geisel Library"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--slate)'
    }
  }, "Destination")));
}
window.RouteMini = RouteMini;
window.DriverApp = DriverApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/driver-app/DriverApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing/Landing.jsx
try { (() => {
/* RIDO — marketing landing page. Tangible-first hero, driver economics, mission below the fold. */
const {
  Button,
  Card,
  FareChip,
  Badge
} = window.RIDODesignSystem_96eb19;
function Ico({
  name,
  size = 20,
  color = 'currentColor',
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !window.lucide) return;
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    el.replaceChildren(i);
    window.lucide.createIcons();
  }, [name]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    className: "rido-ico",
    "aria-hidden": "true",
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      color,
      flexShrink: 0,
      ...style
    }
  });
}
function Logo({
  size = 26,
  light = false
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: size,
      letterSpacing: '-0.04em',
      color: light ? 'var(--white)' : 'var(--midnight)'
    }
  }, "r", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--signal)'
    }
  }, "i"), "do");
}
const WRAP = {
  maxWidth: 1120,
  margin: '0 auto',
  padding: '0 32px'
};
const EYEBROW = {
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: 'var(--slate)'
};
function Nav() {
  const links = ['How it works', 'For drivers', 'Cities'];
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      ...WRAP,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: 78
    }
  }, /*#__PURE__*/React.createElement(Logo, null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 30
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 26
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 14,
      fontWeight: 500,
      color: 'var(--ink)',
      textDecoration: 'none'
    }
  }, l))), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "sm"
  }, "Get a rido")));
}

/* Floating proof cards beside the hero — the card-on-ivory aesthetic. */
function HeroVisual() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      minHeight: 420
    }
  }, /*#__PURE__*/React.createElement(Card, {
    style: {
      position: 'absolute',
      top: 0,
      right: 10,
      width: 290,
      boxShadow: '0 18px 50px rgba(11,42,91,.12)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...EYEBROW,
      marginBottom: 12
    }
  }, "Your ride"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 34,
      color: 'var(--ink)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, "$8.40"), /*#__PURE__*/React.createElement(FareChip, null, "4 min away")), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 1,
      background: 'var(--mist)',
      margin: '14px 0'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: '50%',
      border: '2px solid var(--midnight)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      color: 'var(--slate)'
    }
  }, "Revelle College")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      marginTop: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 9,
      height: 9,
      borderRadius: 2,
      background: 'var(--midnight)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      color: 'var(--ink)',
      fontWeight: 600
    }
  }, "Geisel Library")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true
  }, "Get a rido"))), /*#__PURE__*/React.createElement(Card, {
    style: {
      position: 'absolute',
      top: 250,
      right: 130,
      width: 250,
      boxShadow: '0 18px 50px rgba(11,42,91,.14)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...EYEBROW,
      marginBottom: 10
    }
  }, "Driver keeps"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 38,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1',
      letterSpacing: '-.02em'
    }
  }, "$7.30"), /*#__PURE__*/React.createElement(FareChip, null, "87%")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)',
      marginTop: 6
    }
  }, "An incumbent at 30% would hand them $5.88.")));
}
function Hero() {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      ...WRAP,
      display: 'grid',
      gridTemplateColumns: '1.05fr .95fr',
      gap: 40,
      alignItems: 'center',
      padding: '52px 32px 72px'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    style: {
      marginBottom: 20
    }
  }, "Now live in San Diego"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: 60,
      lineHeight: 1.02,
      letterSpacing: '-0.03em',
      color: 'var(--midnight)',
      margin: 0
    }
  }, "Cheaper. Fairer.", /*#__PURE__*/React.createElement("br", null), "Your r", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--signal)'
    }
  }, "i"), "do is 4 minutes away."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 18,
      lineHeight: 1.55,
      color: 'var(--slate)',
      maxWidth: 460,
      marginTop: 20
    }
  }, "A fair price for you, a fair cut for your driver. The big apps quietly take up to half of every fare \u2014 we built the opposite."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      marginTop: 30
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    size: "lg"
  }, "Get a rido"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "lg"
  }, "Drive with rido")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 28,
      marginTop: 34
    }
  }, [['Drivers keep', '87%', 'of the average fare'], ['Riders pay', '~15%', 'less than incumbents'], ['Launch pilot', '$0', 'driver fees for 6 months']].map(([k, v, s]) => /*#__PURE__*/React.createElement("div", {
    key: k
  }, /*#__PURE__*/React.createElement("div", {
    style: EYEBROW
  }, k), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 26,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1',
      margin: '4px 0 2px'
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)'
    }
  }, s))))), /*#__PURE__*/React.createElement(HeroVisual, null));
}
function HowItWorks() {
  const rider = [['map-pin', 'Tell us where to', 'Type your destination and see the price up front — locked, no surge tricks.'], ['car-front', 'Get matched fast', 'A nearby driver accepts. Track them in on a clean, brand-blue map.'], ['badge-dollar-sign', 'Pay an honest price', 'What you saw is what you pay. No hidden markup between you and your driver.']];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--white)',
      borderTop: '1px solid var(--mist)',
      borderBottom: '1px solid var(--mist)',
      padding: '72px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: WRAP
  }, /*#__PURE__*/React.createElement("div", {
    style: EYEBROW
  }, "How it works"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 36,
      color: 'var(--midnight)',
      letterSpacing: '-0.02em',
      margin: '10px 0 40px'
    }
  }, "Three taps to a fairer ride."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3,1fr)',
      gap: 20
    }
  }, rider.map(([icon, t, d], i) => /*#__PURE__*/React.createElement(Card, {
    key: t,
    padding: 24
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      width: 46,
      height: 46,
      borderRadius: 14,
      background: 'var(--signal-08)',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--signal)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    name: icon,
    size: 22
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 14,
      color: 'var(--mist)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, "0", i + 1)), /*#__PURE__*/React.createElement("h3", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 19,
      color: 'var(--ink)',
      margin: '0 0 8px'
    }
  }, t), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 14.5,
      lineHeight: 1.55,
      color: 'var(--slate)',
      margin: 0
    }
  }, d))))));
}
function Economics() {
  const Bar = ({
    label,
    takePct,
    keepLabel,
    accent
  }) => /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 15,
      color: 'var(--ink)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 15,
      color: 'var(--slate)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, keepLabel)), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      height: 30,
      borderRadius: 999,
      background: 'var(--ivory)',
      border: '1px solid var(--mist)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      width: `${100 - takePct}%`,
      background: accent ? 'var(--signal)' : 'var(--midnight)',
      borderRadius: 999,
      display: 'flex',
      alignItems: 'center',
      paddingLeft: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 13,
      color: 'var(--white)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, "driver keeps ", 100 - takePct, "%"))));
  return /*#__PURE__*/React.createElement("section", {
    style: {
      ...WRAP,
      padding: '72px 32px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 56,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: EYEBROW
  }, "The driver economics"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 36,
      color: 'var(--midnight)',
      letterSpacing: '-0.02em',
      margin: '10px 0 16px'
    }
  }, "Drivers keep up to ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--signal)'
    }
  }, "$1,240"), " more a month."), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 16,
      lineHeight: 1.6,
      color: 'var(--slate)',
      maxWidth: 440
    }
  }, "Our commission falls as you drive \u2014 20% to start, 12%, then just 8% on your highest-volume fares. Incumbents take a flat, opaque cut that effectively runs 35\u201350%."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 24
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary"
  }, "See the full breakdown"))), /*#__PURE__*/React.createElement(Card, {
    padding: 28
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...EYEBROW,
      marginBottom: 20
    }
  }, "On $3,600 of fares this month"), /*#__PURE__*/React.createElement(Bar, {
    label: "rido",
    takePct: 14,
    keepLabel: "$3,112 kept",
    accent: true
  }), /*#__PURE__*/React.createElement(Bar, {
    label: "Typical incumbent",
    takePct: 30,
    keepLabel: "$2,520 kept"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 8,
      paddingTop: 16,
      borderTop: '1px solid var(--mist)'
    }
  }, /*#__PURE__*/React.createElement(Ico, {
    name: "trending-up",
    size: 17,
    color: "var(--signal)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13.5,
      color: 'var(--midnight)'
    }
  }, "That's ", /*#__PURE__*/React.createElement("b", null, "$592"), " more in the driver's pocket \u2014 every single month.")))));
}
function Mission() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: 'var(--midnight)',
      padding: '80px 0'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...WRAP,
      textAlign: 'center',
      maxWidth: 760
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...EYEBROW,
      color: 'rgba(247,245,239,.6)'
    }
  }, "Why we built rido"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 30,
      lineHeight: 1.32,
      color: 'var(--white)',
      letterSpacing: '-0.01em',
      margin: '20px 0 0'
    }
  }, "A ride can be cheaper for you ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--signal)'
    }
  }, "and"), " fairer to your driver at the same time. The only thing standing in the way is how much the middle takes \u2014 so we took less."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      justifyContent: 'center',
      marginTop: 34
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    size: "lg"
  }, "Get a rido"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "lg",
    style: {
      color: 'var(--white)'
    }
  }, "Read our promise"))));
}
function Footer() {
  const cols = [['Rider', ['Get a rido', 'Cities', 'Safety', 'Pricing']], ['Driver', ['Drive with rido', 'Earnings', 'Requirements', 'The pilot']], ['Company', ['Our promise', 'About', 'Careers', 'Contact']]];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: 'var(--white)',
      borderTop: '1px solid var(--mist)',
      padding: '48px 0 36px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...WRAP,
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr 1fr 1fr',
      gap: 32
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Logo, null), /*#__PURE__*/React.createElement("p", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13.5,
      color: 'var(--slate)',
      marginTop: 12,
      maxWidth: 240
    }
  }, "The fair way to move. Cheaper for you, fair for your driver.")), cols.map(([h, items]) => /*#__PURE__*/React.createElement("div", {
    key: h
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      ...EYEBROW,
      marginBottom: 14
    }
  }, h), items.map(it => /*#__PURE__*/React.createElement("a", {
    key: it,
    href: "#",
    style: {
      display: 'block',
      fontFamily: 'var(--font-ui)',
      fontSize: 14,
      color: 'var(--ink)',
      textDecoration: 'none',
      marginBottom: 10
    }
  }, it))))), /*#__PURE__*/React.createElement("div", {
    style: {
      ...WRAP,
      marginTop: 36,
      paddingTop: 20,
      borderTop: '1px solid var(--mist)',
      display: 'flex',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)'
    }
  }, "\xA9 2026 RIDO. San Diego, CA."), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)'
    }
  }, "Privacy \xB7 Terms")));
}
function Landing() {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Nav, null), /*#__PURE__*/React.createElement(Hero, null), /*#__PURE__*/React.createElement(HowItWorks, null), /*#__PURE__*/React.createElement(Economics, null), /*#__PURE__*/React.createElement(Mission, null), /*#__PURE__*/React.createElement(Footer, null));
}
window.Landing = Landing;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing/Landing.jsx", error: String((e && e.message) || e) }); }

// ui_kits/rider-app/PhoneFrame.jsx
try { (() => {
/* RIDO — shared mobile chrome: Icon (Lucide), PhoneFrame, MapCanvas, StatusBar.
 * Exported to window for the rider & driver app kits. */

// Inject the icon-sizing rule once (Lucide replaces <i> with <svg>; we size via the wrapper).
(function injectIconCSS() {
  if (document.getElementById('rido-ico-css')) return;
  const s = document.createElement('style');
  s.id = 'rido-ico-css';
  s.textContent = '.rido-ico > svg{width:100%;height:100%;display:block;stroke-width:2}';
  document.head.appendChild(s);
})();
function Icon({
  name,
  size = 20,
  color = 'currentColor',
  style
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || !window.lucide) return;
    const holder = document.createElement('i');
    holder.setAttribute('data-lucide', name);
    el.replaceChildren(holder);
    window.lucide.createIcons();
  }, [name]);
  return /*#__PURE__*/React.createElement("span", {
    ref: ref,
    className: "rido-ico",
    "aria-hidden": "true",
    style: {
      display: 'inline-flex',
      width: size,
      height: size,
      color,
      flexShrink: 0,
      ...style
    }
  });
}

/* Lowercase in-app wordmark — the voice register. */
function Wordmark({
  size = 22
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 800,
      fontSize: size,
      letterSpacing: '-0.04em',
      color: 'var(--midnight)'
    }
  }, "r", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--signal)'
    }
  }, "i"), "do");
}

/* iOS-ish status bar */
function StatusBar({
  dark = false
}) {
  const c = dark ? 'var(--white)' : 'var(--ink)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 22px 4px',
      fontFamily: 'var(--font-ui)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: c,
      fontFeatureSettings: '"tnum" 1'
    }
  }, "1:48"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center',
      color: c
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "signal",
    size: 15
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "wifi",
    size: 15
  }), /*#__PURE__*/React.createElement(Icon, {
    name: "battery-full",
    size: 17
  })));
}

/* Abstract light map backdrop — faint land blocks, thin roads, a Midnight route + markers. */
function MapCanvas({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      overflow: 'hidden',
      background: '#EEEAE0',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'linear-gradient(0deg, rgba(255,255,255,.55) 0 100%), linear-gradient(0deg, rgba(255,255,255,.55) 0 100%)',
      backgroundSize: '46% 38%, 60% 30%',
      backgroundPosition: '8% 14%, 70% 72%',
      backgroundRepeat: 'no-repeat',
      borderRadius: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '20%',
      left: '54%',
      width: '40%',
      height: '26%',
      background: 'rgba(255,255,255,.5)',
      borderRadius: 8
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '60%',
      left: '6%',
      width: '34%',
      height: '30%',
      background: 'rgba(255,255,255,.5)',
      borderRadius: 8
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '4%',
      right: '-6%',
      width: '38%',
      height: '34%',
      background: 'rgba(42,91,255,.06)',
      borderRadius: 18
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '46%',
      left: 0,
      right: 0,
      height: 6,
      background: 'var(--ivory)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: '50%',
      width: 6,
      background: 'var(--ivory)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '12%',
      left: '-10%',
      width: '130%',
      height: 3,
      background: 'rgba(255,255,255,.8)',
      transform: 'rotate(8deg)'
    }
  }), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 300 500",
    preserveAspectRatio: "none",
    style: {
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%'
    },
    "data-om-raster": true
  }, /*#__PURE__*/React.createElement("path", {
    d: "M150 360 L150 230 Q150 210 132 210 L150 210 L150 150",
    fill: "none",
    stroke: "var(--midnight)",
    strokeWidth: "5",
    strokeLinecap: "round"
  })), children);
}

/* Map markers */
function MapPin({
  top,
  left,
  kind = 'pickup'
}) {
  const styles = {
    pickup: {
      background: 'var(--white)',
      border: '3px solid var(--midnight)'
    },
    dropoff: {
      background: 'var(--midnight)',
      border: '3px solid var(--white)'
    }
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      width: 18,
      height: 18,
      borderRadius: '50%',
      transform: 'translate(-50%,-50%)',
      boxShadow: '0 2px 6px rgba(11,42,91,.25)',
      ...styles[kind]
    }
  });
}

/* Live driver dot in Signal, with a locate-ping ring */
function DriverDot({
  top,
  left
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      transform: 'translate(-50%,-50%)',
      width: 16,
      height: 16
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      border: '2px solid var(--signal)',
      animation: 'rido-ping 1.8s ease-out infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      background: 'var(--signal)',
      boxShadow: '0 0 0 4px rgba(42,91,255,.18)'
    }
  }));
}

/* Phone frame — fixed 390×800 device, scales down to fit small cards. */
function PhoneFrame({
  children,
  dark = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 390,
      height: 800,
      borderRadius: 46,
      background: 'var(--midnight)',
      padding: 10,
      boxShadow: '0 24px 70px rgba(11,42,91,.28)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: '100%',
      height: '100%',
      borderRadius: 38,
      overflow: 'hidden',
      background: dark ? 'var(--midnight)' : 'var(--ivory)',
      display: 'flex',
      flexDirection: 'column'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 130,
      height: 26,
      background: 'var(--midnight)',
      borderRadius: '0 0 16px 16px',
      zIndex: 50
    }
  }), children));
}
(function injectKeyframes() {
  if (document.getElementById('rido-kf')) return;
  const s = document.createElement('style');
  s.id = 'rido-kf';
  s.textContent = '@keyframes rido-ping{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.6);opacity:0}}@media(prefers-reduced-motion:reduce){.rido-ico+*,[style*="rido-ping"]{animation:none!important}}';
  document.head.appendChild(s);
})();
Object.assign(window, {
  Icon,
  Wordmark,
  StatusBar,
  MapCanvas,
  MapPin,
  DriverDot,
  PhoneFrame
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/rider-app/PhoneFrame.jsx", error: String((e && e.message) || e) }); }

// ui_kits/rider-app/RiderApp.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* RIDO — Rider app flow. Map-first request → fare → matched → trip → rate.
 * Composes the DS primitives (Button, Card, Input, Avatar, FareChip, Badge). */
const {
  Button,
  Card,
  Input,
  Avatar,
  FareChip,
  Badge
} = window.RIDODesignSystem_96eb19;
const SHEET = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 40,
  background: 'var(--white)',
  borderRadius: '20px 20px 0 0',
  boxShadow: '0 -10px 34px rgba(11,42,91,.12)',
  padding: '20px 20px 30px'
};
function Grabber() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 5,
      borderRadius: 999,
      background: 'var(--mist)',
      margin: '-6px auto 14px'
    }
  });
}
function TopBar({
  onMenu
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 30,
      left: 0,
      right: 0,
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 16px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'var(--white)',
      border: '1px solid var(--mist)',
      borderRadius: 999,
      padding: '8px 14px',
      boxShadow: '0 4px 14px rgba(11,42,91,.08)'
    }
  }, /*#__PURE__*/React.createElement(window.Wordmark, {
    size: 19
  })), /*#__PURE__*/React.createElement("button", {
    onClick: onMenu,
    style: {
      display: 'flex',
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--white)',
      border: '1px solid var(--mist)',
      borderRadius: 999,
      boxShadow: '0 4px 14px rgba(11,42,91,.08)',
      cursor: 'pointer',
      color: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "menu",
    size: 20
  })));
}
const RECENTS = [{
  icon: 'graduation-cap',
  name: 'Geisel Library',
  sub: 'UC San Diego · 2.1 mi'
}, {
  icon: 'waves',
  name: 'Pacific Beach',
  sub: 'Garnet Ave · 6.4 mi'
}, {
  icon: 'plane',
  name: 'San Diego Intl (SAN)',
  sub: 'Terminal 2 · 11.2 mi'
}];
function RowItem({
  icon,
  name,
  sub,
  onClick,
  trailing
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      width: '100%',
      background: 'none',
      border: 'none',
      borderBottom: '1px solid var(--mist)',
      padding: '13px 2px',
      cursor: 'pointer',
      textAlign: 'left'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      width: 38,
      height: 38,
      borderRadius: 12,
      background: 'var(--ivory)',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'var(--midnight)',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: icon,
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 15,
      color: 'var(--ink)'
    }
  }, name), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)',
      marginTop: 1
    }
  }, sub)), trailing);
}
function TripRoute() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      padding: '2px 0 4px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 11,
      height: 11,
      borderRadius: '50%',
      border: '3px solid var(--midnight)',
      background: 'var(--white)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 2,
      flex: 1,
      minHeight: 24,
      background: 'var(--mist)',
      margin: '3px 0'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      width: 11,
      height: 11,
      borderRadius: 3,
      background: 'var(--midnight)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--ink)'
    }
  }, "Revelle College"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      color: 'var(--slate)',
      marginBottom: 16
    }
  }, "Pickup \xB7 1 min walk"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 14,
      color: 'var(--ink)'
    }
  }, "Geisel Library"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12,
      color: 'var(--slate)'
    }
  }, "Destination")));
}
function RiderApp() {
  const [step, setStep] = React.useState('whereto');
  const [rating, setRating] = React.useState(0);
  React.useEffect(() => {
    if (step === 'searching') {
      const t = setTimeout(() => setStep('matched'), 1900);
      return () => clearTimeout(t);
    }
  }, [step]);
  return /*#__PURE__*/React.createElement(window.PhoneFrame, null, /*#__PURE__*/React.createElement(window.StatusBar, null), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(window.MapCanvas, null, /*#__PURE__*/React.createElement(window.MapPin, {
    top: "72%",
    left: "50%",
    kind: "pickup"
  }), /*#__PURE__*/React.createElement(window.MapPin, {
    top: "30%",
    left: "50%",
    kind: "dropoff"
  }), (step === 'matched' || step === 'arrived') && /*#__PURE__*/React.createElement(window.DriverDot, {
    top: "60%",
    left: "38%"
  })), /*#__PURE__*/React.createElement(TopBar, {
    onMenu: () => {}
  }), step === 'whereto' && /*#__PURE__*/React.createElement("div", {
    style: SHEET
  }, /*#__PURE__*/React.createElement(Grabber, null), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 22,
      color: 'var(--midnight)',
      letterSpacing: '-0.02em',
      marginBottom: 14
    }
  }, "Where to?"), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Search destination",
    leading: /*#__PURE__*/React.createElement(window.Icon, {
      name: "search",
      size: 18,
      style: {
        color: 'var(--slate)'
      }
    })
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 6
    }
  }, RECENTS.map(r => /*#__PURE__*/React.createElement(RowItem, _extends({
    key: r.name
  }, r, {
    onClick: () => setStep('confirm'),
    trailing: /*#__PURE__*/React.createElement(window.Icon, {
      name: "chevron-right",
      size: 18,
      style: {
        color: 'var(--slate)'
      }
    })
  }))))), step === 'confirm' && /*#__PURE__*/React.createElement("div", {
    style: SHEET
  }, /*#__PURE__*/React.createElement(Grabber, null), /*#__PURE__*/React.createElement(Card, {
    padding: 16,
    radius: 16,
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(TripRoute, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 30,
      color: 'var(--ink)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, "$8.40"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--slate)',
      marginTop: 2
    }
  }, "Price locked \u2014 what you see is what you pay.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement(FareChip, null, "4 min away"), /*#__PURE__*/React.createElement(FareChip, {
    tone: "midnight"
  }, "2.1 mi"))), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    onClick: () => setStep('searching')
  }, "Get a rido"))), step === 'searching' && /*#__PURE__*/React.createElement("div", {
    style: SHEET
  }, /*#__PURE__*/React.createElement(Grabber, null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '6px 0 18px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'relative',
      width: 22,
      height: 22
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: '50%',
      border: '2px solid var(--signal)',
      animation: 'rido-ping 1.6s ease-out infinite'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      inset: 5,
      borderRadius: '50%',
      background: 'var(--signal)'
    }
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 18,
      color: 'var(--midnight)'
    }
  }, "Finding your rido\u2026"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      color: 'var(--slate)'
    }
  }, "Matching you with a nearby driver"))), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    fullWidth: true,
    onClick: () => setStep('confirm')
  }, "Cancel")), (step === 'matched' || step === 'arrived') && /*#__PURE__*/React.createElement("div", {
    style: SHEET
  }, /*#__PURE__*/React.createElement(Grabber, null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: "accent"
  }, step === 'arrived' ? 'Arrived' : 'Marcus is on the way'), /*#__PURE__*/React.createElement(FareChip, null, step === 'arrived' ? 'Here now' : '3 min away')), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Marcus T.",
    size: 50
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontWeight: 600,
      fontSize: 16,
      color: 'var(--ink)'
    }
  }, "Marcus T."), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 3,
      fontFamily: 'var(--font-display)',
      fontWeight: 600,
      fontSize: 13,
      color: 'var(--midnight)',
      fontFeatureSettings: '"tnum" 1'
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "star",
    size: 13,
    style: {
      color: 'var(--signal)'
    }
  }), "4.96")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13,
      color: 'var(--slate)',
      marginTop: 1
    }
  }, "Blue Honda Civic \xB7 7XYZ123")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: iconBtn
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "message-square",
    size: 18
  })), /*#__PURE__*/React.createElement("button", {
    style: iconBtn
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "phone",
    size: 18
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      marginTop: 14,
      marginBottom: 16,
      padding: '10px 12px',
      background: 'var(--signal-08)',
      borderRadius: 12
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "heart-handshake",
    size: 16,
    style: {
      color: 'var(--signal)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 12.5,
      color: 'var(--midnight)'
    }
  }, "Your driver keeps ", /*#__PURE__*/React.createElement("b", null, "87%"), " of this fare.")), step === 'matched' ? /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    onClick: () => setStep('arrived')
  }, "I'm at the pickup") : /*#__PURE__*/React.createElement(Button, {
    variant: "accent",
    fullWidth: true,
    onClick: () => setStep('rate')
  }, "Start trip")), step === 'rate' && /*#__PURE__*/React.createElement("div", {
    style: SHEET
  }, /*#__PURE__*/React.createElement(Grabber, null), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '4px 0 6px'
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Marcus T.",
    size: 56,
    style: {
      margin: '0 auto 12px'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-display)',
      fontWeight: 700,
      fontSize: 22,
      color: 'var(--midnight)'
    }
  }, "Rate your rido"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--font-ui)',
      fontSize: 13.5,
      color: 'var(--slate)',
      marginTop: 3
    }
  }, "How was the ride with Marcus?"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      justifyContent: 'center',
      gap: 8,
      margin: '16px 0'
    }
  }, [1, 2, 3, 4, 5].map(n => /*#__PURE__*/React.createElement("button", {
    key: n,
    onClick: () => setRating(n),
    style: {
      background: 'none',
      border: 'none',
      cursor: 'pointer',
      color: n <= rating ? 'var(--signal)' : 'var(--mist)',
      padding: 0
    }
  }, /*#__PURE__*/React.createElement(window.Icon, {
    name: "star",
    size: 34
  }))))), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    fullWidth: true,
    onClick: () => {
      setStep('whereto');
      setRating(0);
    }
  }, "Done"))));
}
const iconBtn = {
  display: 'flex',
  width: 42,
  height: 42,
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--white)',
  border: '1px solid var(--mist)',
  borderRadius: 999,
  cursor: 'pointer',
  color: 'var(--midnight)'
};
window.RiderApp = RiderApp;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/rider-app/RiderApp.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.FareChip = __ds_scope.FareChip;

__ds_ns.StatusToggle = __ds_scope.StatusToggle;

__ds_ns.TierProgress = __ds_scope.TierProgress;

})();
