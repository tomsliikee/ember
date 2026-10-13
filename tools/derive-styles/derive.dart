// Derives the colour roles of every style from its seed, through the
// Material 3 vibrant scheme, and prints them as JSON:
//
//   dart pub get --offline && dart run derive.dart ../../toms-expressive-design/tokens.json > ../styles.json
//
// Only needed when a seed changes. The library ships with Flutter, so
// "--offline" finds it in the pub cache of a machine that has Flutter.

import 'dart:convert';
import 'dart:io';

import 'package:material_color_utilities/material_color_utilities.dart';

const roles = <String, DynamicColor Function()>{
  'primary': _primary,
  'on-primary': _onPrimary,
  'primary-container': _primaryContainer,
  'on-primary-container': _onPrimaryContainer,
  'secondary': _secondary,
  'on-secondary': _onSecondary,
  'secondary-container': _secondaryContainer,
  'on-secondary-container': _onSecondaryContainer,
  'tertiary': _tertiary,
  'on-tertiary': _onTertiary,
  'tertiary-container': _tertiaryContainer,
  'on-tertiary-container': _onTertiaryContainer,
  'surface': _surface,
  'surface-container-lowest': _surfaceContainerLowest,
  'surface-container-low': _surfaceContainerLow,
  'surface-container': _surfaceContainer,
  'surface-container-high': _surfaceContainerHigh,
  'surface-container-highest': _surfaceContainerHighest,
  'surface-bright': _surfaceBright,
  'on-surface': _onSurface,
  'on-surface-variant': _onSurfaceVariant,
  'outline': _outline,
  'outline-variant': _outlineVariant,
  'inverse-surface': _inverseSurface,
  'inverse-on-surface': _inverseOnSurface,
  'inverse-primary': _inversePrimary,
};

DynamicColor _primary() => MaterialDynamicColors.primary;
DynamicColor _onPrimary() => MaterialDynamicColors.onPrimary;
DynamicColor _primaryContainer() => MaterialDynamicColors.primaryContainer;
DynamicColor _onPrimaryContainer() => MaterialDynamicColors.onPrimaryContainer;
DynamicColor _secondary() => MaterialDynamicColors.secondary;
DynamicColor _onSecondary() => MaterialDynamicColors.onSecondary;
DynamicColor _secondaryContainer() => MaterialDynamicColors.secondaryContainer;
DynamicColor _onSecondaryContainer() => MaterialDynamicColors.onSecondaryContainer;
DynamicColor _tertiary() => MaterialDynamicColors.tertiary;
DynamicColor _onTertiary() => MaterialDynamicColors.onTertiary;
DynamicColor _tertiaryContainer() => MaterialDynamicColors.tertiaryContainer;
DynamicColor _onTertiaryContainer() => MaterialDynamicColors.onTertiaryContainer;
DynamicColor _surface() => MaterialDynamicColors.surface;
DynamicColor _surfaceContainerLowest() => MaterialDynamicColors.surfaceContainerLowest;
DynamicColor _surfaceContainerLow() => MaterialDynamicColors.surfaceContainerLow;
DynamicColor _surfaceContainer() => MaterialDynamicColors.surfaceContainer;
DynamicColor _surfaceContainerHigh() => MaterialDynamicColors.surfaceContainerHigh;
DynamicColor _surfaceContainerHighest() => MaterialDynamicColors.surfaceContainerHighest;
DynamicColor _surfaceBright() => MaterialDynamicColors.surfaceBright;
DynamicColor _onSurface() => MaterialDynamicColors.onSurface;
DynamicColor _onSurfaceVariant() => MaterialDynamicColors.onSurfaceVariant;
DynamicColor _outline() => MaterialDynamicColors.outline;
DynamicColor _outlineVariant() => MaterialDynamicColors.outlineVariant;
DynamicColor _inverseSurface() => MaterialDynamicColors.inverseSurface;
DynamicColor _inverseOnSurface() => MaterialDynamicColors.inverseOnSurface;
DynamicColor _inversePrimary() => MaterialDynamicColors.inversePrimary;

String hex(int argb) => '#${(argb & 0xffffff).toRadixString(16).padLeft(6, '0')}';

void main(List<String> arguments) {
  final system = jsonDecode(File(arguments.first).readAsStringSync()) as Map<String, dynamic>;
  final tokens = (system['color'] as Map<String, dynamic>)['tokens'] as List<dynamic>;
  final styles = <String, Map<String, Map<String, String>>>{};
  for (final token in tokens.cast<Map<String, dynamic>>()) {
    final name = token['name'] as String;
    // seed-red is the tone of a section, not a style of its own.
    if (!name.startsWith('seed-') || name == 'seed-red') continue;
    final seed = Hct.fromInt(int.parse((token['value'] as String).substring(1), radix: 16) | 0xff000000);
    styles[name.substring('seed-'.length)] = {
      for (final dark in [false, true])
        dark ? 'dark' : 'light': {
          for (final role in roles.entries)
            role.key: hex(role.value().getArgb(
                SchemeVibrant(sourceColorHct: seed, isDark: dark, contrastLevel: 0))),
        },
    };
  }
  stdout.writeln(const JsonEncoder.withIndent('  ').convert(styles));
}
