import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, StyleProp, ViewStyle } from 'react-native'
import { C } from '../theme'

export interface ActionItem {
  label: string
  onPress: () => void
  destructive?: boolean
}

interface Props {
  visible: boolean
  title?: string
  actions: ActionItem[]
  onClose: () => void
  style?: StyleProp<ViewStyle>
}

/**
 * Кастомный bottom-sheet вместо Alert.alert.
 * Нужен потому что Alert.alert на Android поддерживает максимум 3 кнопки
 * (positive / negative / neutral) — лишние молча обрезаются и "Отмена" пропадает.
 */
export default function ActionSheet({ visible, title, actions, onClose, style }: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Backdrop — тап закрывает */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, style]}>
          {title ? (
            <>
              <Text style={styles.title}>{title}</Text>
              <View style={styles.sep} />
            </>
          ) : null}

          {actions.map((action, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.item, i > 0 && styles.itemBorder]}
              onPress={() => {
                onClose()
                // Небольшая задержка, чтобы Modal успел закрыться до следующего Alert
                setTimeout(action.onPress, Platform.OS === 'android' ? 150 : 80)
              }}
              activeOpacity={0.65}
            >
              <Text style={[styles.itemText, action.destructive && styles.destructiveText]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}

          {/* Визуальный разрыв перед «Отмена» */}
          <View style={styles.cancelSep} />

          <TouchableOpacity style={styles.cancelItem} onPress={onClose} activeOpacity={0.65}>
            <Text style={styles.cancelText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  sheet: {
    backgroundColor: C.BG_WARM,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderColor: C.BORDER,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  title: {
    color: C.TEXT_MUTED,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  sep: {
    height: 1,
    backgroundColor: C.DIVIDER,
  },
  item: {
    paddingVertical: 16,
    paddingHorizontal: 22,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.DIVIDER,
  },
  itemText: {
    color: C.TEXT,
    fontSize: 16,
  },
  destructiveText: {
    color: C.ERROR,
  },
  cancelSep: {
    height: 8,
    backgroundColor: C.BG,
  },
  cancelItem: {
    paddingVertical: 16,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  cancelText: {
    color: C.AMBER,
    fontSize: 16,
    fontWeight: '600',
  },
})
