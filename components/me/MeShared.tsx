import { View, Text, TouchableOpacity } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { styles } from './meStyles'

export type PreviewItem = { key: string; icon: any; title: string; sub: string; href: string }
// A cluster is one or more groups. An unlabeled group renders as a plain list
// (provider side, unchanged); labeled groups get a small sub-header so a longer
// list scans easily instead of being one undifferentiated block (client side).
export type PreviewGroup = { label?: string; items: PreviewItem[] }

// Grouped Coming Soon cluster, shared by both Me tabs.
export function ComingSoonCluster({ groups }: { groups: PreviewGroup[] }) {
  return (
    <>
      <Text style={styles.clusterLabel}>Coming soon</Text>
      {groups.map((group, gi) => (
        <View key={group.label ?? `group-${gi}`}>
          {group.label ? <Text style={styles.clusterSubLabel}>{group.label}</Text> : null}
          <View style={styles.rowsGroup}>
            {group.items.map((p, idx) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.clusterRow, idx < group.items.length - 1 && styles.studioRowBorder]}
                activeOpacity={0.7}
                onPress={() => router.push(p.href as never)}
              >
                <View style={styles.clusterIcon}>
                  <Feather name={p.icon} size={16} color="rgba(240,232,213,0.6)" />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.clusterTitle}>{p.title}</Text>
                  <Text style={styles.clusterSub}>{p.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.2)" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </>
  )
}
