import * as React from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import { safeChatHref } from '../../../shared/mobile-domain/chat-rendering';
import { useAuth } from '@/auth/auth-context';
import { tokens } from '@/theme/tokens';
import { Body } from './ui';

export function AssistantMessage({ content }: { content: string }) {
  const { instanceUrl } = useAuth();
  const [error, setError] = React.useState('');
  function inline(value: string) {
    return value.split(/(\*\*[^*]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\))/gu).map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**'))
        return (
          <Text key={index} style={{ fontWeight: '700' }}>
            {part.slice(2, -2)}
          </Text>
        );
      if (part.startsWith('`') && part.endsWith('`'))
        return (
          <Text key={index} style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
            {part.slice(1, -1)}
          </Text>
        );
      const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
      const href = link && safeChatHref(link[2]);
      if (link && href && (!href.startsWith('/') || instanceUrl))
        return (
          <Text
            key={index}
            accessibilityRole="link"
            accessibilityHint="Opens in your browser"
            style={{ textDecorationLine: 'underline' }}
            onPress={() => {
              setError('');
              void Linking.openURL(
                href.startsWith('/') ? new URL(href, instanceUrl!).href : href,
              ).catch(() =>
                setError('This link could not be opened. Your conversation is retained.'),
              );
            }}
          >
            {link[1]}
          </Text>
        );
      return part;
    });
  }
  return (
    <View style={{ minWidth: 0, gap: tokens.space.sm }}>
      {content
        .split(/(```[^\n]*\n[\s\S]*?(?:```|$))/gu)
        .filter(Boolean)
        .map((part, index) =>
          part.startsWith('```') ? (
            <ScrollView key={index} horizontal accessibilityLabel="Code block">
              <Text
                selectable
                style={{
                  color: tokens.color.ink,
                  fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                }}
              >
                {part.slice(part.indexOf('\n') + 1).replace(/```$/u, '')}
              </Text>
            </ScrollView>
          ) : (
            <Body key={index}>{inline(part)}</Body>
          ),
        )}
      {error && (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Body>{error}</Body>
        </View>
      )}
    </View>
  );
}
